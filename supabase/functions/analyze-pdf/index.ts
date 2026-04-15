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
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
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

    // Call AI to analyze PDF quality with improved, deterministic prompt
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert document quality analyst specializing in genealogy interview documents. You MUST analyze PDF documents objectively and consistently using the following STRICT scoring rubrics.

## CLARITY & NEATNESS SCORING RUBRIC (0-100):

**90-100 (Excellent):** Crystal clear scan, perfect alignment, no shadows/artifacts, excellent contrast, all text fully readable, professional document appearance.

**75-89 (Good):** Minor issues only - slight shadows at edges, minor skew (<3°), good contrast, text is clear and readable, small artifacts that don't affect readability.

**60-74 (Fair):** Noticeable but manageable issues - moderate shadows, visible skew (3-10°), some contrast issues, text readable with effort, some pages better than others.

**40-59 (Below Average):** Significant issues affecting usability - heavy shadows, notable skew (>10°), poor contrast in areas, some text difficult to read, inconsistent quality.

**0-39 (Poor):** Major issues - very dark/light scans, severe skew, extensive shadows, large portions difficult or impossible to read, missing pages, severely degraded.

## HANDWRITING LEGIBILITY SCORING RUBRIC (0-100):

**90-100 (Excellent):** All handwriting clearly legible, consistent letter formation, good ink quality, proper spacing between words/lines, neat and organized.

**75-89 (Good):** Most handwriting legible, occasional unclear letters, generally consistent, minor ink issues, good overall readability.

**60-74 (Fair):** Handwriting readable with effort, inconsistent letter sizes, some words require interpretation, adequate but not ideal.

**40-59 (Below Average):** Many words difficult to decipher, poor letter formation, inconsistent spacing, ink too light/heavy in places, requires significant effort to read.

**0-39 (Poor):** Most handwriting illegible, very poor letter formation, major ink problems, large sections unreadable, minimal usable content.

## YOUR TASK:
1. Examine the document carefully
2. Assess EACH criterion independently using the rubrics above
3. Provide a score for each that reflects the ACTUAL quality you observe
4. Be CONSISTENT - similar documents should receive similar scores
5. Provide specific, actionable feedback

Respond ONLY with valid JSON in this exact format:
{
  "clarity_score": <number 0-100>,
  "legibility_score": <number 0-100>,
  "feedback": "<string with 2-4 sentences of specific observations and actionable improvement suggestions>"
}`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this genealogy interview PDF document. Evaluate the scan clarity/neatness and handwriting legibility separately using the scoring rubrics. Be specific about what you observe. PDF URL: ${pdfUrl}`,
              },
            ],
          },
        ],
        temperature: 0.2, // Lower temperature for more consistent/deterministic results
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      
      // Handle AI credit exhaustion - log admin notification and return graceful response
      if (aiResponse.status === 402) {
        // Insert admin notification about credit exhaustion
        await supabase
          .from("admin_notifications")
          .insert({
            type: "ai_credit_exhausted",
            message: "AI credits exhausted. PDF analysis could not be completed.",
            metadata: { auditId, timestamp: new Date().toISOString() }
          });
        
        // Return 200 with ai_unavailable flag for graceful client handling
        return new Response(
          JSON.stringify({ 
            success: false, 
            ai_unavailable: true, 
            message: "AI analysis unavailable. Please use manual scoring." 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (aiResponse.status === 429) {
        // Return 200 with ai_unavailable flag for graceful client handling
        return new Response(
          JSON.stringify({ 
            success: false, 
            ai_unavailable: true, 
            message: "AI service is busy. Please try again later or use manual scoring." 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
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
        pdf_scores_manually_adjusted: false, // Reset manual adjustment flag on new AI analysis
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
