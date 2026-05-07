import { supabase } from "@/integrations/supabase/client";
import { isValidInterviewName } from "@/lib/utils";
import { compressPdf, shouldCompressPdf } from "@/utils/compressPdf";

export type UploadMode = "new" | "re_audit";
export type UploadKind = "pdf" | "metadata_zip" | "unknown";

export interface UploadOutcome {
  status: "success" | "failed" | "duplicate" | "locked" | "quota_blocked";
  message?: string;
  audit_id?: string | null;
}

export function detectKind(file: File): UploadKind {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (lower.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed") return "metadata_zip";
  return "unknown";
}

async function logAttempt(args: {
  user_id: string;
  file_name: string;
  detected_kind: UploadKind;
  mode: UploadMode;
  outcome: UploadOutcome;
}) {
  try {
    await supabase.from("upload_attempts").insert({
      user_id: args.user_id,
      file_name: args.file_name,
      detected_kind: args.detected_kind,
      mode: args.mode,
      status: args.outcome.status,
      message: args.outcome.message ?? null,
      audit_id: args.outcome.audit_id ?? null,
    });
  } catch {
    /* swallow logging errors */
  }
}

async function uploadToBucket(bucket: string, path: string, file: File): Promise<string> {
  const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (signErr) throw signErr;
  const res = await fetch(signed.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || (path.endsWith(".pdf") ? "application/pdf" : "application/zip") },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
  return publicUrl;
}

export async function uploadInterviewFile(opts: {
  file: File;
  mode: UploadMode;
  userId: string;
}): Promise<UploadOutcome> {
  const { file, mode, userId } = opts;
  const kind = detectKind(file);
  const baseName = file.name.replace(/\.(pdf|zip)$/i, "");

  if (kind === "unknown") {
    const out: UploadOutcome = { status: "failed", message: "Unsupported file type. Use PDF or ZIP." };
    await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
    return out;
  }

  if (!isValidInterviewName(baseName)) {
    const out: UploadOutcome = { status: "failed", message: "Invalid filename. Expected NGXX_XXXX_XXXXXXXX_XXXX." };
    await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
    return out;
  }

  // pre-flight: locks + quotas (only matters for new interviews; re-audit replacement is allowed)
  if (mode === "new") {
    const { error: gateErr } = await supabase.rpc("assert_upload_allowed", { _file_name: baseName, _new_names: 0 });
    if (gateErr) {
      const msg = gateErr.message || "Upload blocked";
      const status: UploadOutcome["status"] = msg.toLowerCase().includes("locked") ? "locked" : "quota_blocked";
      const out: UploadOutcome = { status, message: msg };
      await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
      return out;
    }
  }

  // find existing audit
  const { data: existing } = await supabase.from("audits").select("id, file_name, status").eq("file_name", baseName).maybeSingle();

  try {
    if (kind === "pdf") {
      let f = file;
      if (shouldCompressPdf(f)) {
        try { f = await compressPdf(f); } catch { /* fall back to original */ }
      }
      if (mode === "new") {
        if (existing) {
          const out: UploadOutcome = { status: "duplicate", message: "Interview already exists.", audit_id: existing.id };
          await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
          return out;
        }
        const path = `${baseName}_${Date.now()}.pdf`;
        const publicUrl = await uploadToBucket("audit-pdfs", path, f);
        const { data: ins, error: insErr } = await supabase.from("audits").insert({
          file_name: baseName, file_url: publicUrl, status: "Pending", uploaded_by: userId,
        }).select("id").single();
        if (insErr) throw insErr;
        const out: UploadOutcome = { status: "success", message: "Uploaded.", audit_id: ins?.id };
        await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
        return out;
      } else {
        if (!existing) {
          const out: UploadOutcome = { status: "failed", message: "No existing interview to re-audit." };
          await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
          return out;
        }
        const path = `${baseName}_${Date.now()}.pdf`;
        const publicUrl = await uploadToBucket("audit-pdfs", path, f);
        const { error: updErr } = await supabase.from("audits").update({
          file_url: publicUrl,
          status: "Pending",
          last_modified: new Date().toISOString(),
        }).eq("id", existing.id);
        if (updErr) throw updErr;
        const out: UploadOutcome = { status: "success", message: "Re-audit PDF uploaded.", audit_id: existing.id };
        await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
        return out;
      }
    }

    // ZIP / metadata
    if (!existing) {
      const out: UploadOutcome = { status: "failed", message: "Upload the PDF first, then the metadata ZIP." };
      await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
      return out;
    }
    const zipPath = `${baseName}_${Date.now()}.zip`;
    const publicUrl = await uploadToBucket("mobile-zips", zipPath, file);
    const { error: updErr } = await supabase.from("audits").update({
      mobile_zip_url: publicUrl,
      mobile_zip_uploaded_at: new Date().toISOString(),
      status: mode === "re_audit" ? "Pending" : undefined,
    }).eq("id", existing.id);
    if (updErr) throw updErr;
    // best-effort parse
    supabase.functions.invoke("process-mobile-zip", { body: { auditId: existing.id } }).catch(() => {});
    const out: UploadOutcome = { status: "success", message: "Metadata uploaded.", audit_id: existing.id };
    await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
    return out;
  } catch (e: any) {
    const out: UploadOutcome = { status: "failed", message: e?.message || "Upload failed" };
    await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
    return out;
  }
}