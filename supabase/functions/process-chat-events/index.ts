import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function findOrCreateAuditThread(db: ReturnType<typeof admin>, payload: any) {
  const auditId = payload.audit_id as string;

  // If a thread already exists for this audit, reuse
  const { data: existing } = await db
    .from("chat_conversations")
    .select("id")
    .eq("audit_id", auditId)
    .eq("category", "failed_audit")
    .maybeSingle();

  let convId = existing?.id as string | undefined;

  // Resolve audit + metadata to determine participants
  const { data: audit } = await db
    .from("audits")
    .select("id, file_name, status, uploaded_by, reviewed_by")
    .eq("id", auditId)
    .maybeSingle();
  if (!audit) return;

  const { data: meta } = await db
    .from("interview_metadata")
    .select("interviewer_code, contractor_id")
    .eq("audit_id", auditId)
    .maybeSingle();

  const contractorId = meta?.contractor_id || null;

  // Resolve effective FM (override > current team_assignment)
  const { data: override } = await db
    .from("interview_fm_overrides")
    .select("field_manager_id")
    .eq("audit_id", auditId)
    .maybeSingle();

  let fmId: string | null = override?.field_manager_id ?? null;
  if (!fmId && meta?.interviewer_code && contractorId) {
    const { data: ta } = await db
      .from("team_assignments")
      .select("field_manager_id")
      .eq("interviewer_code", meta.interviewer_code)
      .eq("contractor_id", contractorId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    fmId = ta?.field_manager_id ?? null;
  }

  // Find auditor user_id by full_name (reviewed_by is text)
  let auditorId: string | null = null;
  if (audit.reviewed_by) {
    const { data: auditor } = await db
      .from("profiles")
      .select("id")
      .eq("full_name", audit.reviewed_by)
      .maybeSingle();
    auditorId = auditor?.id ?? null;
  }

  // Find contractor + sub-contractor profiles
  const participantIds = new Set<string>();
  if (fmId) participantIds.add(fmId);
  if (auditorId) participantIds.add(auditorId);

  if (contractorId) {
    const { data: contractorProfiles } = await db
      .from("profiles")
      .select("id")
      .eq("contractor_id", contractorId);
    const contractorIds = (contractorProfiles || []).map((p) => p.id);
    if (contractorIds.length) {
      const { data: rolesRows } = await db
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", contractorIds);
      (rolesRows || []).forEach((r) => {
        if (["contractor", "sub_contractor"].includes(r.role)) participantIds.add(r.user_id);
      });
    }
  }

  // Add admins (limited fan-out)
  const { data: adminRoles } = await db
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  (adminRoles || []).forEach((r) => participantIds.add(r.user_id));

  // Create conversation if missing
  if (!convId) {
    const { data: conv, error: cErr } = await db
      .from("chat_conversations")
      .insert({
        type: "audit_thread",
        category: "failed_audit",
        title: `Failed Audit – ${payload.file_name}`,
        contractor_id: contractorId,
        audit_id: auditId,
        created_by: auditorId,
      })
      .select("id")
      .single();
    if (cErr) throw cErr;
    convId = conv.id;
  }

  // Upsert participants
  const partRows = Array.from(participantIds).map((uid) => ({
    conversation_id: convId!,
    user_id: uid,
    participant_role: uid === fmId ? "owner" : "member",
  }));
  if (partRows.length) {
    await db.from("chat_participants").upsert(partRows, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });
  }

  // Post system message describing the failure
  await db.from("chat_messages").insert({
    conversation_id: convId,
    sender_id: null,
    message_type: "audit_action",
    body: `Audit failed: ${payload.file_name}`,
    metadata: {
      audit_id: auditId,
      file_name: payload.file_name,
      review_comment: payload.review_comment,
      action_plan: payload.action_plan,
      reviewed_by: payload.reviewed_by,
      artifact_correction: payload.artifact_correction || [],
      actions: ["view_review", "mark_resolved", "resubmit_with_correction", "resubmit_no_correction"],
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const { data: events } = await db
      .from("chat_pending_events")
      .select("*")
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    let processed = 0;
    for (const evt of events || []) {
      try {
        if (evt.event_type === "audit_failed") {
          await findOrCreateAuditThread(db, evt.payload);
        }
        await db
          .from("chat_pending_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("id", evt.id);
        processed++;
      } catch (err: any) {
        await db
          .from("chat_pending_events")
          .update({ error: String(err?.message || err) })
          .eq("id", evt.id);
      }
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});