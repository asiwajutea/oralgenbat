import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { MetadataPanel } from "@/components/review/MetadataPanel";
import { PhotosPanel } from "@/components/review/PhotosPanel";
import { AudioAnalysisPanel } from "@/components/review/AudioAnalysisPanel";
import { PDFViewer } from "@/components/review/PDFViewer";
import { ReviewNavigation } from "@/components/review/ReviewNavigation";

const ReviewInterview = () => {
  const { auditId } = useParams<{ auditId: string }>();

  const { data: audit, isLoading: auditLoading } = useQuery({
    queryKey: ["audit", auditId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audits")
        .select("*")
        .eq("id", auditId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!auditId,
  });

  const { data: metadata, isLoading: metadataLoading } = useQuery({
    queryKey: ["interview-metadata", auditId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interview_metadata")
        .select("*")
        .eq("audit_id", auditId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!auditId,
  });

  const { data: photos, isLoading: photosLoading } = useQuery({
    queryKey: ["interview-photos", auditId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interview_photos")
        .select("*")
        .eq("audit_id", auditId)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!auditId,
  });

  const { data: nextAudit } = useQuery({
    queryKey: ["next-unreviewed-audit", auditId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audits")
        .select("id")
        .or('status.in.(Pending,Awaiting Review),reviewed_by.is.null')
        .neq("id", auditId)
        .order("uploaded_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!auditId,
  });

  const isLoading = auditLoading || metadataLoading || photosLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Audit Not Found</h2>
          <p className="text-muted-foreground">The requested audit could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Metadata & Media */}
      <div className="w-1/2 border-r border-border overflow-y-auto bg-background">
        <div className="p-6 space-y-6">
          <ReviewNavigation nextAuditId={nextAudit?.id} />
          
          <div className="border-b border-border pb-4">
            <h1 className="text-2xl font-bold">Interview Review</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Interview ID: {audit.file_name}
            </p>
          </div>

          {metadata ? (
            <>
              <MetadataPanel metadata={metadata} />
              <PhotosPanel photos={photos || []} auditId={auditId!} />
              <AudioAnalysisPanel metadata={metadata} />
            </>
          ) : (
            <div className="p-8 text-center border border-dashed rounded-lg">
              <p className="text-muted-foreground">
                No mobile data available for this interview.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Upload a mobile ZIP file to see interview details.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - PDF Viewer */}
      <div className="w-1/2 overflow-hidden bg-muted/5">
        <PDFViewer pdfUrl={audit.file_url} />
      </div>
    </div>
  );
};

export default ReviewInterview;
