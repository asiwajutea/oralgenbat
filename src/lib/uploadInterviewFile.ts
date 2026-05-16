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

async function uploadToBucket(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (signErr) throw signErr;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else reject(new Error(`Upload failed (${xhr.status})`));
    });
    xhr.addEventListener("error", () => reject(new Error("Upload failed")));
    xhr.open("PUT", signed.signedUrl);
    xhr.setRequestHeader("Content-Type", file.type || (path.endsWith(".pdf") ? "application/pdf" : "application/zip"));
    xhr.send(file);
  });
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
  return publicUrl;
}

export async function uploadInterviewFile(opts: {
  file: File;
  mode: UploadMode;
  userId: string;
  onProgress?: (pct: number) => void;
}): Promise<UploadOutcome> {
  const { file, mode, userId, onProgress } = opts;
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
  const { data: existing } = await supabase.from("audits").select("id, file_name, status, re_audit_count").eq("file_name", baseName).maybeSingle();
  // for ZIPs we also need to know whether metadata is already uploaded
  let existingHasMetadata = false;
  if (existing && kind === "metadata_zip") {
    const { data: a2 } = await supabase.from("audits").select("mobile_zip_url").eq("id", existing.id).maybeSingle();
    existingHasMetadata = !!a2?.mobile_zip_url;
  }

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
        const publicUrl = await uploadToBucket("audit-pdfs", path, f, onProgress);
        const { data: ins, error: insErr } = await supabase.from("audits").insert({
          file_name: baseName, file_url: publicUrl, status: "Pending", uploaded_by: userId,
        }).select("id").single();
        if (insErr) throw insErr;
        const out: UploadOutcome = { status: "success", message: "Uploaded.", audit_id: ins?.id };
        await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
        return out;
      } else {
        if (!existing) {
          const out: UploadOutcome = { status: "failed", message: "No matching interview found for this file name." };
          await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
          return out;
        }
        const path = `${baseName}_${Date.now()}.pdf`;
        const publicUrl = await uploadToBucket("audit-pdfs", path, f, onProgress);
        const { error: updErr } = await supabase.from("audits").update({
          file_url: publicUrl,
          status: "Awaiting Review",
          is_re_audit: true,
          re_audit_count: ((existing as any).re_audit_count || 0) + 1,
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
      const out: UploadOutcome = { status: "failed", message: "No matching interview found for this file name. Upload the PDF first." };
      await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
      return out;
    }
    if (mode === "new" && existingHasMetadata) {
      const out: UploadOutcome = {
        status: "duplicate",
        message: "Metadata already uploaded for this interview. Use Replace files to overwrite.",
        audit_id: existing.id,
      };
      await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
      return out;
    }
    const zipPath = `${baseName}_${Date.now()}.zip`;
    const publicUrl = await uploadToBucket("mobile-zips", zipPath, file, onProgress);
    const updatePayload: any = {
      mobile_zip_url: publicUrl,
      mobile_zip_uploaded_at: new Date().toISOString(),
    };
    if (mode === "re_audit") {
      updatePayload.status = "Awaiting Review";
      updatePayload.is_re_audit = true;
      updatePayload.re_audit_count = ((existing as any).re_audit_count || 0) + 1;
      updatePayload.last_modified = new Date().toISOString();
    }
    const { error: updErr } = await supabase.from("audits").update(updatePayload).eq("id", existing.id);
    if (updErr) throw updErr;
    // best-effort parse — MUST include mobileZipUrl, the edge function requires both args
    supabase.functions.invoke("process-mobile-zip", {
      body: { auditId: existing.id, mobileZipUrl: publicUrl },
    }).catch(() => {});
    const out: UploadOutcome = { status: "success", message: "Metadata uploaded.", audit_id: existing.id };
    await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
    return out;
  } catch (e: any) {
    const out: UploadOutcome = { status: "failed", message: e?.message || "Upload failed" };
    await logAttempt({ user_id: userId, file_name: file.name, detected_kind: kind, mode, outcome: out });
    return out;
  }
}