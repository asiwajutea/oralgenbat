import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function render(tpl: string, vars: Record<string, unknown>, html: boolean): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => {
    const v = vars[k];
    if (v === undefined || v === null) return "";
    return html ? escapeHtml(String(v)) : String(v);
  });
}

const TYPE_TO_TEMPLATE: Record<string, { key: string; pref: string }> = {
  audit_passed: { key: "audit_passed", pref: "notify_audit_passed" },
  failed_audit: { key: "audit_failed", pref: "notify_failed_audit" },
  re_audit: { key: "re_audit_requested", pref: "notify_re_audit" },
  new_interviews: { key: "new_interview_uploaded", pref: "notify_new_interviews" },
  team_requests: { key: "team_request", pref: "notify_team_requests" },
  agent_reassigned: { key: "agent_reassigned", pref: "notify_agent_reassigned" },
  interview_assigned: { key: "interview_assigned", pref: "notify_interview_assigned" },
  account_status: { key: "account_status", pref: "notify_account_status" },
  new_registration: { key: "new_registration", pref: "notify_new_registration" },
  payment: { key: "payment_recorded", pref: "notify_payment" },
  data_entry_complete: { key: "data_entry_complete", pref: "notify_data_entry_complete" },
  issues: { key: "issue_flagged", pref: "notify_issues" },
  comments: { key: "comment_reply", pref: "notify_comments" },
  milestones: { key: "achievement_earned", pref: "notify_milestones" },
  inactivity: { key: "inactivity_reminder", pref: "notify_inactivity" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    const body = await req.json();
    let { template_key, recipients, variables, user_id, notification_type, title, message, metadata, audit_id, event } = body ?? {};
    variables = variables ?? {};

    // Trigger path: user_id + notification_type
    if (!template_key && notification_type) {
      const map = TYPE_TO_TEMPLATE[notification_type];
      if (!map) {
        return new Response(JSON.stringify({ skipped: "no template for type", notification_type }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      template_key = map.key;
      // load profile + preferences
      const { data: profile } = await supabase.from("profiles").select("email,full_name").eq("id", user_id).maybeSingle();
      if (!profile?.email) {
        return new Response(JSON.stringify({ skipped: "no profile email" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: prefs } = await supabase.from("user_email_preferences").select("*").eq("user_id", user_id).maybeSingle();
      const enabled = prefs?.emails_enabled ?? true;
      const typePref = prefs ? (prefs as Record<string, unknown>)[map.pref] ?? true : true;
      if (!enabled || !typePref) {
        await supabase.from("email_notification_logs").insert({
          template_key, recipients: [profile.email], status: "skipped",
          error_message: "User opted out", triggered_by_event: notification_type, audit_id, metadata,
        });
        return new Response(JSON.stringify({ skipped: "user opted out" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      recipients = [profile.email];
      variables = { recipient_name: profile.full_name || "there", title, message, ...(metadata || {}) };
      event = notification_type;
    }

    if (!template_key || !recipients?.length) {
      return new Response(JSON.stringify({ error: "template_key and recipients required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tpl, error: tplErr } = await supabase.from("email_templates").select("*").eq("key", template_key).maybeSingle();
    if (tplErr || !tpl) {
      return new Response(JSON.stringify({ error: "template not found", template_key }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!tpl.enabled) {
      await supabase.from("email_notification_logs").insert({ template_key, recipients, status: "skipped", error_message: "Template disabled", triggered_by_event: event, audit_id, metadata });
      return new Response(JSON.stringify({ skipped: "template disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const subject = render(tpl.subject, variables, false);
    const html = render(tpl.body_html, variables, true);
    const text = render(tpl.body_text || "", variables, false);

    const { data: sendRes, error: sendErr } = await supabase.functions.invoke("send-gmail", {
      body: { to: recipients, subject, html, text },
    });

    const status = sendErr || (sendRes && sendRes.success === false) ? "failed" : "sent";
    await supabase.from("email_notification_logs").insert({
      template_key, recipients, subject, body_preview: text.slice(0, 500),
      status, error_message: sendErr?.message || sendRes?.error || null,
      provider_response: sendRes ?? null, triggered_by_event: event, audit_id, metadata,
    });

    return new Response(JSON.stringify({ success: status === "sent", status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});