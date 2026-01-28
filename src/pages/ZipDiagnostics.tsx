import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

/**
 * Safer ZIP status model
 */
type ZipStatus =
  | "valid" // Metadata extracted successfully
  | "processing" // ZIP uploaded, extraction likely still running
  | "partial" // Photos exist but metadata missing
  | "extraction_failed"; // Extraction attempted, nothing extracted

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

/**
 * How long we allow before calling extraction "failed"
 * Adjust to match your pipeline latency
 */
const PROCESSING_GRACE_MINUTES = 15;

const ZipDiagnostics = () => {
  const queryClient = useQueryClient();

  const {
    data: diagnosticResults = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["zip-diagnostics"],
    queryFn: async (): Promise<ZipDiagnosticResult[]> => {
      /**
       * 1. Load audits that have ZIPs
       */
      const { data: audits, error: auditsError } = await supabase
        .from("audits")
        .select("id, file_name, mobile_zip_url, mobile_zip_uploaded_at")
        .not("mobile_zip_url", "is", null);

      if (auditsError) throw auditsError;
      if (!audits || audits.length === 0) return [];

      const auditIds = audits.map((a) => a.id);

      /**
       * 2. Load extracted data in parallel
       */
      const [{ data: metadata, error: metadataError }, { data: photos, error: photosError }] = await Promise.all([
        supabase.from("interview_metadata").select("audit_id").in("audit_id", auditIds),
        supabase.from("interview_photos").select("audit_id").in("audit_id", auditIds),
      ]);

      /**
       * 🚨 If RLS or permissions block access,
       * we DO NOT mark ZIPs as corrupted
       */
      if (metadataError || photosError) {
        console.error("ZIP diagnostics blocked by RLS or permissions", {
          metadataError,
          photosError,
        });

        return audits.map((audit) => ({
          id: audit.id,
          file_name: audit.file_name,
          mobile_zip_url: audit.mobile_zip_url,
          mobile_zip_uploaded_at: audit.mobile_zip_uploaded_at,
          has_metadata: false,
          has_photos: false,
          photo_count: 0,
          status: "processing",
          status_reason: "Extraction status unavailable (permission or network issue)",
        }));
      }

      /**
       * 3. Build lookup maps
       */
      const metadataSet = new Set(metadata?.map((m) => m.audit_id));
      const photoCountMap = new Map<string, number>();

      photos?.forEach((p) => {
        photoCountMap.set(p.audit_id, (photoCountMap.get(p.audit_id) || 0) + 1);
      });

      /**
       * 4. Compute safe status
       */
      const now = Date.now();

      return audits.map((audit) => {
        const hasMetadata = metadataSet.has(audit.id);
        const photoCount = photoCountMap.get(audit.id) || 0;
        const hasPhotos = photoCount > 0;

        const uploadedAt = audit.mobile_zip_uploaded_at ? new Date(audit.mobile_zip_uploaded_at).getTime() : null;

        const minutesSinceUpload = uploadedAt !== null ? (now - uploadedAt) / 60000 : null;

        let status: ZipStatus;
        let status_reason: string;

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
          status_reason = "Extraction attempted but no data was produced";
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

  /**
   * Example badge helper (optional)
   */
  const renderStatusBadge = (status: ZipStatus) => {
    switch (status) {
      case "valid":
        return <Badge className="bg-green-100 text-green-700">Valid</Badge>;
      case "processing":
        return <Badge className="bg-blue-100 text-blue-700">Processing</Badge>;
      case "partial":
        return <Badge className="bg-yellow-100 text-yellow-700">Partial</Badge>;
      case "extraction_failed":
        return <Badge className="bg-red-100 text-red-700">Extraction Failed</Badge>;
    }
  };

  if (isLoading) return <div className="p-4">Scanning ZIPs…</div>;
  if (error) return <div className="p-4 text-red-600">Failed to load diagnostics</div>;

  /**
   * Minimal render (replace with your table/UI)
   */
  return (
    <div className="p-6 space-y-4">
      {diagnosticResults.map((result) => (
        <div key={result.id} className="flex items-center justify-between border rounded p-3">
          <div>
            <div className="font-medium">{result.file_name}</div>
            <div className="text-xs text-muted-foreground">{result.status_reason}</div>
          </div>
          {renderStatusBadge(result.status)}
        </div>
      ))}
    </div>
  );
};

export default ZipDiagnostics;
