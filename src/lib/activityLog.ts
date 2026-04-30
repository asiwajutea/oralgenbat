import { supabase } from "@/integrations/supabase/client";

export interface LogActivityInput {
  action_type: string;
  entity_type?: string | null;
  entity_id?: string | null;
  entity_label?: string | null;
  description?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Fire-and-forget activity logger. Inserts into user_activity_log for the
 * currently authenticated user. Errors are swallowed so logging never breaks
 * the calling user flow.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return;

    // Best-effort role lookup (used by triggers too, so non-fatal if missing).
    let userRole: string | null = null;
    try {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      userRole = (roleRow?.role as string) ?? null;
    } catch {
      userRole = null;
    }

    await supabase.from("user_activity_log").insert({
      user_id: userId,
      user_role: userRole as any,
      action_type: input.action_type,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      entity_label: input.entity_label ?? null,
      description: input.description ?? null,
      metadata: (input.metadata ?? {}) as any,
    });
  } catch (err) {
    // Intentional: logging must never throw into user code paths.
    if (typeof console !== "undefined") {
      console.debug("logActivity failed", err);
    }
  }
}

export const ActivityActions = {
  Login: "login",
  Logout: "logout",
  AuditPassed: "audit_passed",
  AuditFailed: "audit_failed",
  AuditPassWithOverride: "audit_pass_with_override",
  AuditSentToBurn: "audit_sent_to_burn",
  AuditRestoredFromBurn: "audit_restored_from_burn",
  ReAuditRequested: "re_audit_requested",
  ReAuditSubmitted: "re_audit_submitted",
  PdfUploaded: "pdf_uploaded",
  MetadataUploaded: "metadata_uploaded",
  ZipUploaded: "zip_uploaded",
  BulkUpload: "bulk_upload",
  InterviewDeleted: "interview_deleted",
  FmReassigned: "fm_reassigned",
  IssueFlagged: "issue_flagged",
  IssueResolved: "issue_resolved",
  CommentAdded: "comment_added",
  ArtifactCorrectionResolved: "artifact_correction_resolved",
  TeamRequestCreated: "team_request_created",
  TeamRequestApproved: "team_request_approved",
  TeamRequestRejected: "team_request_rejected",
  UserApproved: "user_approved",
  UserSuspended: "user_suspended",
  UserRoleChanged: "user_role_changed",
  PaymentCreated: "payment_created",
  InvoiceUploaded: "invoice_uploaded",
  BudgetTargetSet: "budget_target_set",
  AnnouncementCreated: "announcement_created",
  PushSent: "push_sent",
  NotificationSettingsUpdated: "notification_settings_updated",
  AiSettingsUpdated: "ai_settings_updated",
} as const;