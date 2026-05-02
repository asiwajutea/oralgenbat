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

async function ensureDirectThread(
  db: ReturnType<typeof admin>,
  opts: { userId: string; title: string; category: string; contractorId?: string | null; auditId?: string | null }
) {
  // Try to reuse the most recent system thread of this category for this user
  const { data: existing } = await db
    .from("chat_conversations")
    .select("id, chat_participants!inner(user_id)")
    .eq("category", opts.category)
    .eq("type", "system")
    .eq("chat_participants.user_id", opts.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: conv, error: cErr } = await db
    .from("chat_conversations")
    .insert({
      type: "system",
      category: opts.category,
      title: opts.title,
      contractor_id: opts.contractorId ?? null,
      audit_id: opts.auditId ?? null,
      created_by: null,
    })
    .select("id")
    .single();
  if (cErr) throw cErr;
  await db.from("chat_participants").insert({
    conversation_id: conv.id,
    user_id: opts.userId,
    participant_role: "member",
  });
  return conv.id as string;
}

async function handlePushDelivered(db: ReturnType<typeof admin>, payload: any) {
  if (!payload?.user_id) return;
  const convId = await ensureDirectThread(db, {
    userId: payload.user_id,
    title: "Notifications",
    category: "push",
  });
  await db.from("chat_messages").insert({
    conversation_id: convId,
    sender_id: null,
    message_type: "system",
    body: payload.title || "Notification",
    metadata: {
      message: payload.message || null,
      url: payload.url || null,
      push_notification_id: payload.push_notification_id || null,
    },
  });
}

async function handleAnnouncement(db: ReturnType<typeof admin>, payload: any) {
  // Resolve target users
  const userIds = new Set<string>();
  const targetType: string = payload.target_type || "all";
  if (targetType === "user" && Array.isArray(payload.target_user_ids)) {
    payload.target_user_ids.forEach((id: string) => id && userIds.add(id));
  } else if (targetType === "contractor" && payload.target_contractor_id) {
    const { data } = await db.from("profiles").select("id").or(`contractor_id.eq.${payload.target_contractor_id},active_contractor_id.eq.${payload.target_contractor_id}`);
    (data || []).forEach((p) => userIds.add(p.id));
  } else if (targetType === "role" && payload.target_role) {
    const { data } = await db.from("user_roles").select("user_id").eq("role", payload.target_role);
    (data || []).forEach((r) => userIds.add(r.user_id));
  } else {
    // all approved users
    const { data } = await db.from("profiles").select("id").eq("is_approved", true);
    (data || []).forEach((p) => userIds.add(p.id));
  }

  for (const uid of userIds) {
    const convId = await ensureDirectThread(db, {
      userId: uid,
      title: "Announcements",
      category: "announcement",
    });
    await db.from("chat_messages").insert({
      conversation_id: convId,
      sender_id: payload.created_by || null,
      message_type: "system",
      body: payload.title || "New announcement",
      metadata: {
        announcement_id: payload.announcement_id,
        content: payload.content,
        cta_text: payload.cta_text,
        cta_url: payload.cta_url,
        style: payload.style,
      },
    });
  }
}

async function handleTrackingComment(db: ReturnType<typeof admin>, payload: any) {
  const auditId = payload.audit_id;
  if (!auditId) return;

  // Reuse existing tracking thread for this audit (or create one)
  const { data: existing } = await db
    .from("chat_conversations")
    .select("id")
    .eq("audit_id", auditId)
    .eq("category", "tracking_comment")
    .maybeSingle();

  let convId = existing?.id as string | undefined;

  if (!convId) {
    const { data: conv, error: cErr } = await db
      .from("chat_conversations")
      .insert({
        type: "audit_thread",
        category: "tracking_comment",
        title: `Tracking – ${payload.file_name || auditId}`,
        contractor_id: payload.contractor_id || null,
        audit_id: auditId,
        created_by: payload.user_id || null,
      })
      .select("id")
      .single();
    if (cErr) throw cErr;
    convId = conv.id;

    // Add the commenter + same-contractor admins/contractors/sub_contractors
    const participantIds = new Set<string>();
    if (payload.user_id) participantIds.add(payload.user_id);

    if (payload.contractor_id) {
      const { data: cps } = await db.from("profiles").select("id").or(`contractor_id.eq.${payload.contractor_id},active_contractor_id.eq.${payload.contractor_id}`);
      const cpIds = (cps || []).map((p) => p.id);
      if (cpIds.length) {
        const { data: rolesRows } = await db.from("user_roles").select("user_id, role").in("user_id", cpIds);
        (rolesRows || []).forEach((r) => {
          if (["contractor", "sub_contractor", "field_manager"].includes(r.role)) participantIds.add(r.user_id);
        });
      }
    }
    const { data: adminRoles } = await db.from("user_roles").select("user_id").eq("role", "admin");
    (adminRoles || []).forEach((r) => participantIds.add(r.user_id));

    const partRows = Array.from(participantIds).map((uid) => ({
      conversation_id: convId!,
      user_id: uid,
      participant_role: "member",
    }));
    if (partRows.length) {
      await db.from("chat_participants").upsert(partRows, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });
    }
  }

  await db.from("chat_messages").insert({
    conversation_id: convId,
    sender_id: payload.user_id || null,
    message_type: "text",
    body: payload.comment,
    metadata: {
      audit_id: auditId,
      tracking_comment_id: payload.comment_id,
      file_name: payload.file_name,
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
        } else if (evt.event_type === "push_delivered") {
          await handlePushDelivered(db, evt.payload);
        } else if (evt.event_type === "announcement_published") {
          await handleAnnouncement(db, evt.payload);
        } else if (evt.event_type === "tracking_comment_added") {
          await handleTrackingComment(db, evt.payload);
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