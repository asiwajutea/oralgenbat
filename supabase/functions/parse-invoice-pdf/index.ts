import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedInvoiceEntry {
  folderName: string;
  interviewId: string;
  names: number;
  amount: number;
  matchedAuditId: string | null;
}

interface ParsedInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  contractor: string;
  vendorId: string;
  newPayments: ParsedInvoiceEntry[];
  additions: ParsedInvoiceEntry[];
  deductions: ParsedInvoiceEntry[];
  totals: {
    newPayments: number;
    additions: number;
    deductions: number;
    grandTotal: number;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { fileName } = await req.json();

    if (!fileName) {
      return new Response(
        JSON.stringify({ error: "fileName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download the PDF file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("audit-pdfs")
      .download(fileName);

    if (downloadError) {
      console.error("Download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "Failed to download file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert to text using Lovable AI
    const fileBytes = await fileData.arrayBuffer();
    const base64Content = btoa(String.fromCharCode(...new Uint8Array(fileBytes)));

    // Use AI to parse the PDF content
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    
    if (!openaiApiKey) {
      // Fallback: Parse using regex patterns from expected PDF structure
      console.log("No Lovable API key, using fallback parsing");
      
      // For now, return a mock response - the actual PDF parsing would need
      // a PDF library or AI service
      return new Response(
        JSON.stringify({
          error: "PDF parsing requires configuration. Please contact support."
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Lovable AI to parse the PDF
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b:free",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Parse this Self-Billing Invoice PDF and extract the following information in JSON format:
                
1. Invoice metadata: invoiceNumber, invoiceDate (YYYY-MM-DD format), contractor name, vendorId
2. "New Interviews Processed" section: Array of objects with folderName, interviewId, names (number), amount (number)
3. "Additions" section: Array of objects with folderName, interviewId, names (number), amount (number)  
4. "Deductions for Incorrect Prior Payments" section: Array of objects with folderName, interviewId, names (negative number), amount (negative number)
5. Totals: newPayments total amount, additions total, deductions total, grandTotal

Return ONLY valid JSON with this structure:
{
  "invoiceNumber": "2026-0014",
  "invoiceDate": "2026-01-05",
  "contractor": "ZAMOPH Resources Company Limited",
  "vendorId": "406002",
  "newPayments": [{"folderName": "NG71_696_20251103_1035", "interviewId": "2943472", "names": 130, "amount": 15.60}],
  "additions": [],
  "deductions": [],
  "totals": {"newPayments": 515.64, "additions": 0, "deductions": 0, "grandTotal": 515.64}
}`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64Content}`
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI response error:", await aiResponse.text());
      return new Response(
        JSON.stringify({ error: "Failed to parse PDF with AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content returned from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract JSON from the response
    let parsedData: ParsedInvoice;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      parsedData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Content:", content);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response as JSON" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Match folder names to audit IDs in the database
    const allFolderNames = [
      ...parsedData.newPayments.map(p => p.folderName),
      ...parsedData.additions.map(p => p.folderName),
      ...parsedData.deductions.map(p => p.folderName),
    ];

    const { data: audits } = await supabase
      .from("audits")
      .select("id, file_name")
      .in("file_name", allFolderNames);

    const auditMap = new Map(audits?.map(a => [a.file_name, a.id]) || []);

    // Add matched audit IDs
    parsedData.newPayments = parsedData.newPayments.map(p => ({
      ...p,
      matchedAuditId: auditMap.get(p.folderName) || null,
    }));
    parsedData.additions = parsedData.additions.map(p => ({
      ...p,
      matchedAuditId: auditMap.get(p.folderName) || null,
    }));
    parsedData.deductions = parsedData.deductions.map(p => ({
      ...p,
      matchedAuditId: auditMap.get(p.folderName) || null,
    }));

    // Clean up the temporary file
    await supabase.storage.from("audit-pdfs").remove([fileName]);

    return new Response(
      JSON.stringify(parsedData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
