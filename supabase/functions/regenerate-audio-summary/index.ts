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

    // Fetch existing metadata to get noise/silence levels
    const { data: metadata, error: fetchError } = await supabase
      .from("interview_metadata")
      .select("family_story_noise_level, family_story_silence_level, pedigree_segment_noise_level, pedigree_segment_silence_level")
      .eq("audit_id", auditId)
      .single();

    if (fetchError || !metadata) {
      console.error("Error fetching metadata:", fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch audio metadata' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const prompt = `Analyze these two audio recordings and provide a brief quality assessment summary (2-3 sentences):

Family Story Recording:
- Duration: ${familyStoryDuration} seconds (${formatDuration(familyStoryDuration)})
- Noise Level: ${metadata.family_story_noise_level?.toFixed(1) || '0.0'}%
- Silence Level: ${metadata.family_story_silence_level?.toFixed(1) || '0.0'}%

Pedigree Segment Recording:
- Duration: ${pedigreeDuration} seconds (${formatDuration(pedigreeDuration)})
- Noise Level: ${metadata.pedigree_segment_noise_level?.toFixed(1) || '0.0'}%
- Silence Level: ${metadata.pedigree_segment_silence_level?.toFixed(1) || '0.0'}%

Provide an overall quality rating (Excellent/Good/Fair/Poor) and mention any concerns about noise or silence levels.`;

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
            content: "You are an audio quality assessment expert. Provide concise, professional quality assessments."
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
