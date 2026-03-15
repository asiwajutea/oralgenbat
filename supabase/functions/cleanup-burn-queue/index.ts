import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find burn queue items older than 190 days that haven't been restored
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 190);

    const { data: expiredItems, error: fetchError } = await supabase
      .from("burn_queue")
      .select("id, audit_id, file_name")
      .is("restored_at", null)
      .lt("sent_at", cutoffDate.toISOString());

    if (fetchError) throw fetchError;

    if (!expiredItems || expiredItems.length === 0) {
      return new Response(
        JSON.stringify({ message: "No items to clean up", deleted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let deletedCount = 0;
    const errors: string[] = [];

    for (const item of expiredItems) {
      try {
        // Cascade delete related records
        const tables = [
          "audit_checklist_progress",
          "artifact_correction_comments",
          "re_audit_submissions",
          "interview_assignments",
          "sms_notification_logs",
          "payment_records",
          "audit_file_cleanup_log",
          "interview_photos",
          "interview_metadata",
        ];

        for (const table of tables) {
          await supabase.from(table).delete().eq("audit_id", item.audit_id);
        }

        // Delete the audit itself
        const { error: deleteError } = await supabase
          .from("audits")
          .delete()
          .eq("id", item.audit_id);

        if (deleteError) {
          errors.push(`Failed to delete audit ${item.audit_id}: ${deleteError.message}`);
          continue;
        }

        // Remove from burn queue
        await supabase.from("burn_queue").delete().eq("id", item.id);

        deletedCount++;
      } catch (e) {
        errors.push(`Error processing ${item.audit_id}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Cleaned up ${deletedCount} burned interviews`,
        deleted: deletedCount,
        total: expiredItems.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
