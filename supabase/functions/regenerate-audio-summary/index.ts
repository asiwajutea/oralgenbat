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
    const { 
      auditId, 
      familyStoryDuration, 
      pedigreeDuration,
      familyNoiseLevel,
      pedigreeNoiseLevel 
    } = await req.json();

    if (!auditId || !familyStoryDuration || !pedigreeDuration) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: auditId, familyStoryDuration, pedigreeDuration' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Regenerating audio summary for audit: ${auditId}`);
    console.log(`Family Story: ${familyStoryDuration}s, Noise: ${familyNoiseLevel}%`);
    console.log(`Pedigree: ${pedigreeDuration}s, Noise: ${pedigreeNoiseLevel}%`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch existing metadata to get silence levels
    const { data: metadata, error: fetchError } = await supabase
      .from("interview_metadata")
      .select("family_story_silence_level, pedigree_segment_silence_level")
      .eq("audit_id", auditId)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching metadata:", fetchError);
    }

    const familySilenceLevel = metadata?.family_story_silence_level ?? null;
    const pedigreeSilenceLevel = metadata?.pedigree_segment_silence_level ?? null;

    // Generate new AI summary with confirmed durations and noise levels
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not found");
    }

    const formatDuration = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getNoiseDescription = (level: number | null) => {
      if (level === null) return "Not rated";
      if (level <= 10) return "Excellent (minimal/no noise)";
      if (level <= 30) return "Good (light background noise)";
      if (level <= 50) return "Fair (moderate noise)";
      if (level <= 70) return "Poor (significant noise)";
      return "Very Poor (mostly noise)";
    };

    const systemPrompt = `You are assessing audio recordings for a field genealogy interview project conducted in open outdoor spaces in Africa. These are NOT studio recordings - some ambient environmental sounds are expected.

KEY PROJECT STANDARDS:
- Family Story recording should be at least 10 minutes (600 seconds)
- Pedigree Segment recording should be at least 15 minutes (900 seconds)
- Duration is the PRIMARY quality indicator
- Noise level is manually rated by the reviewer (lower is better)
- Silence level is auto-calculated (high silence >20% indicates potential issues like long pauses or gaps)

QUALITY RATING GUIDELINES:
- Excellent: Both durations meet requirements, noise levels 1-2, silence under 15%
- Good: Both durations meet requirements, noise levels acceptable (up to 3), minor silence issues
- Fair: One recording below duration OR significant noise (level 4) OR high silence
- Poor: Both recordings below duration OR very poor noise (level 5) OR both recordings have issues`;

    const prompt = `Assess these two field interview recordings:

**Family Story Recording:**
- Duration: ${formatDuration(familyStoryDuration)} (${familyStoryDuration} seconds)
- Minimum required: 10:00 (600 seconds)
- Noise Level: ${familyNoiseLevel !== null ? `${familyNoiseLevel}% - ${getNoiseDescription(familyNoiseLevel)}` : 'Not rated'}
- Silence Level: ${familySilenceLevel !== null ? `${familySilenceLevel}%` : 'Not available'}

**Pedigree Segment Recording:**
- Duration: ${formatDuration(pedigreeDuration)} (${pedigreeDuration} seconds)
- Minimum required: 15:00 (900 seconds)
- Noise Level: ${pedigreeNoiseLevel !== null ? `${pedigreeNoiseLevel}% - ${getNoiseDescription(pedigreeNoiseLevel)}` : 'Not rated'}
- Silence Level: ${pedigreeSilenceLevel !== null ? `${pedigreeSilenceLevel}%` : 'Not available'}

Provide a brief quality assessment (2-3 sentences) covering:
1. Whether durations meet requirements
2. Impact of the noise levels on audio clarity
3. Any concerns from silence levels (if high)

End with an overall rating: Excellent, Good, Fair, or Poor.`;

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
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to your Lovable workspace to continue using AI features.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'AI rate limit exceeded. Please wait a moment and try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
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