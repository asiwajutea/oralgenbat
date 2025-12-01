import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { auditId } = await req.json();
    console.log("Cleaning up audio files for audit:", auditId);

    if (!auditId) {
      throw new Error("Missing required parameter: auditId");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Delete audio files from storage
    const filesToDelete = [
      `${auditId}/family_story.mp3`,
      `${auditId}/pedigree_segment.mp3`
    ];

    console.log("Deleting audio files from storage:", filesToDelete);
    const { data: deleteData, error: deleteError } = await supabase.storage
      .from("interview-audio")
      .remove(filesToDelete);

    if (deleteError) {
      console.error("Error deleting audio files:", deleteError);
      // Don't throw - continue to clear URLs even if files don't exist
    } else {
      console.log("Successfully deleted audio files:", deleteData);
    }

    // Clear audio URLs from metadata
    console.log("Clearing audio URLs from metadata...");
    const { error: updateError } = await supabase
      .from("interview_metadata")
      .update({
        family_story_audio_url: null,
        pedigree_segment_audio_url: null,
      })
      .eq("audit_id", auditId);

    if (updateError) {
      console.error("Error clearing audio URLs:", updateError);
      throw updateError;
    }

    console.log("Audio cleanup completed successfully");
    return new Response(
      JSON.stringify({ 
        success: true,
        message: "Audio files cleaned up successfully"
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in cleanup-interview-audio:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
