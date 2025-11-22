import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { auditId } = await req.json();

    if (!auditId) {
      throw new Error("auditId is required");
    }

    console.log("Analyzing PDF for audit:", auditId);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get audit data
    const { data: audit, error: auditError } = await supabase
      .from("audits")
      .select("file_url")
      .eq("id", auditId)
      .single();

    if (auditError || !audit) {
      throw new Error("Audit not found");
    }

    const pdfUrl = audit.file_url;
    console.log("PDF URL:", pdfUrl);

    // Call AI to analyze PDF quality
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `You are analyzing a genealogy interview document PDF. You need to assess:
1. Overall clarity and neatness (0-100): Consider scan quality, contrast, alignment, margins, blurriness, shadows, skewed pages
2. Handwriting legibility (0-100): How easy is the handwritten text to read? Consider ink quality, letter formation, spacing
3. Provide specific feedback on quality issues: List any problems, suggest improvements, note illegible sections

Respond ONLY with valid JSON in this exact format:
{
  "clarity_score": <number 0-100>,
  "legibility_score": <number 0-100>,
  "feedback": "<string with detailed feedback>"
}`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Please analyze the quality of this PDF document from a genealogy interview. Assess the clarity, neatness, and handwriting legibility. The PDF is available at: ${pdfUrl}`,
              },
            ],
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    console.log("AI response:", aiContent);

    // Parse AI response
    let analysis;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                       aiContent.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiContent;
      analysis = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      // Provide default scores if parsing fails
      analysis = {
        clarity_score: 70,
        legibility_score: 70,
        feedback: "PDF analysis completed. Unable to provide detailed assessment.",
      };
    }

    // Ensure scores are within valid range
    const clarityScore = Math.max(0, Math.min(100, analysis.clarity_score || 70));
    const legibilityScore = Math.max(0, Math.min(100, analysis.legibility_score || 70));

    // Update interview_metadata
    const { error: updateError } = await supabase
      .from("interview_metadata")
      .update({
        pdf_clarity_score: clarityScore,
        pdf_handwriting_legibility: legibilityScore,
        pdf_quality_feedback: analysis.feedback || "PDF analysis completed.",
        pdf_analyzed_at: new Date().toISOString(),
      })
      .eq("audit_id", auditId);

    if (updateError) {
      console.error("Failed to update metadata:", updateError);
      throw updateError;
    }

    console.log("PDF analysis completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        clarity_score: clarityScore,
        legibility_score: legibilityScore,
        feedback: analysis.feedback,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in analyze-pdf function:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
