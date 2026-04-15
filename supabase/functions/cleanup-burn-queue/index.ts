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

    // Auth validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    const { data: isSuperAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'super_admin' });
    if (!isAdmin && !isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Find burn queue items older than 90 days that haven't been restored
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

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
        // Delete burn_queue entry FIRST (before audits to avoid FK issues)
        await supabase.from("burn_queue").delete().eq("id", item.id);

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

        // Delete the audit last
        const { error: deleteError } = await supabase
          .from("audits")
          .delete()
          .eq("id", item.audit_id);

        if (deleteError) {
          errors.push(`Failed to delete audit ${item.audit_id}: ${deleteError.message}`);
          continue;
        }

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
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
