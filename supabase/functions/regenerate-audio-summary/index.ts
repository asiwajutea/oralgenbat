import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.83.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { auditId, familyStoryDuration, pedigreeDuration } = await req.json();

    if (!auditId || !familyStoryDuration || !pedigreeDuration) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: auditId, familyStoryDuration, pedigreeDuration' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Regenerating audio summary for audit: ${auditId}`);
    console.log(`Family Story: ${familyStoryDuration}s, Pedigree: ${pedigreeDuration}s`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate new AI summary with confirmed durations
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not found");
    }

    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const systemPrompt = `You are assessing audio recordings for a field genealogy interview project conducted in open outdoor spaces in Africa. These are NOT studio recordings - ambient environmental sounds from ongoing activities nearby are completely normal and acceptable.

KEY PROJECT STANDARDS:
- Family Story recording should be at least 10 minutes (600 seconds)
- Pedigree Segment recording should be at least 15 minutes (900 seconds)
- Continuous dialogue is expected throughout - extended silent periods indicate potential issues
- Background ambient sounds do NOT affect quality rating

IMPORTANT: Base your assessment ONLY on recording duration. Do not comment on noise levels.`;

    const prompt = `Assess these two field interview recordings:

Family Story Recording: ${formatDuration(familyStoryDuration)} (${familyStoryDuration} seconds)
- Minimum required: 10:00 (600 seconds)

Pedigree Segment Recording: ${formatDuration(pedigreeDuration)} (${pedigreeDuration} seconds)
- Minimum required: 15:00 (900 seconds)

Provide a brief quality assessment (2-3 sentences) with an overall rating:
- Excellent: Both recordings meet or exceed duration requirements
- Good: Both recordings close to requirements (within 10% below minimum)
- Fair: One recording significantly below requirement
- Poor: Both recordings significantly below requirements`;

    console.log("Calling Lovable AI to regenerate summary...");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: prompt
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Lovable AI error:", aiResponse.status, errorText);
      throw new Error(`Lovable AI request failed: ${aiResponse.statusText}`);
    }

    const aiData = await aiResponse.json();
    const newSummary = aiData.choices[0].message.content;

    console.log("AI generated new summary:", newSummary);

    // Update the audio_quality_summary in the database
    const { error: updateError } = await supabase
      .from("interview_metadata")
      .update({ audio_quality_summary: newSummary })
      .eq("audit_id", auditId);

    if (updateError) {
      console.error("Error updating summary:", updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update audio summary' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Successfully regenerated and saved audio summary");

    return new Response(
      JSON.stringify({ success: true, summary: newSummary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error in regenerate-audio-summary:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
