import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type ZipStatus = "valid" | "processing" | "extraction_failed" | "partial";

interface ZipDiagnosticResult {
  id: string;
  file_name: string;
  mobile_zip_url: string;
  mobile_zip_uploaded_at: string | null;
  has_metadata: boolean;
  has_photos: boolean;
  photo_count: number;
  status: ZipStatus;
  status_reason: string;
}

const PROCESSING_GRACE_MINUTES = 15;

const ZipDiagnostics = () => {
  const queryClient = useQueryClient();

  const { data: diagnosticResults = [] } = useQuery({
    queryKey: ["zip-diagnostics"],
    queryFn: async (): Promise<ZipDiagnosticResult[]> => {
      const { data: audits, error: auditsError } = await supabase
        .from("audits")
        .select("id, file_name, mobile_zip_url, mobile_zip_uploaded_at")
        .not("mobile_zip_url", "is", null);

      if (auditsError) throw auditsError;
      if (!audits?.length) return [];

      const auditIds = audits.map((a) => a.id);

      const [{ data: metadata, error: metadataError }, { data: photos, error: photosError }] = await Promise.all([
        supabase.from("interview_metadata").select("audit_id").in("audit_id", auditIds),
        supabase.from("interview_photos").select("audit_id").in("audit_id", auditIds),
      ]);

      // 🚨 RLS / permission guard
      if (metadataError || photosError) {
        console.error("Diagnostic query blocked:", { metadataError, photosError });
        return audits.map((a) => ({
          id: a.id,
          file_name: a.file_name,
          mobile_zip_url: a.mobile_zip_url,
          mobile_zip_uploaded_at: a.mobile_zip_uploaded_at,
          has_metadata: false,
          has_photos: false,
          photo_count: 0,
          status: "processing",
          status_reason: "Extraction status unavailable (permission or network issue)",
        }));
      }

      const metadataSet = new Set(metadata?.map((m) => m.audit_id));
      const photoCountMap = new Map<string, number>();

      photos?.forEach((p) => {
        photoCountMap.set(p.audit_id, (photoCountMap.get(p.audit_id) || 0) + 1);
      });

      const now = Date.now();

      return audits.map((audit) => {
        const hasMetadata = metadataSet.has(audit.id);
        const photoCount = photoCountMap.get(audit.id) || 0;
        const hasPhotos = photoCount > 0;

        let status: ZipStatus;
        let status_reason: string;

        const uploadedAt = audit.mobile_zip_uploaded_at ? new Date(audit.mobile_zip_uploaded_at).getTime() : null;

        const minutesSinceUpload = uploadedAt ? (now - uploadedAt) / 60000 : null;

        if (hasMetadata) {
          status = "valid";
          status_reason = "Metadata extracted successfully";
        } else if (hasPhotos) {
          status = "partial";
          status_reason = "Photos extracted but metadata missing";
        } else if (minutesSinceUpload !== null && minutesSinceUpload < PROCESSING_GRACE_MINUTES) {
          status = "processing";
          status_reason = "ZIP uploaded, extraction still in progress";
        } else {
          status = "extraction_failed";
          status_reason = "Extraction attempted but produced no data";
        }

        return {
          id: audit.id,
          file_name: audit.file_name,
          mobile_zip_url: audit.mobile_zip_url,
          mobile_zip_uploaded_at: audit.mobile_zip_uploaded_at,
          has_metadata: hasMetadata,
          has_photos: hasPhotos,
          photo_count: photoCount,
          status,
          status_reason,
        };
      });
    },
  });

  return <pre className="p-4 text-sm">{JSON.stringify(diagnosticResults, null, 2)}</pre>;
};

export default ZipDiagnostics;
