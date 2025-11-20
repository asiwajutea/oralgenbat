import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { MetadataPanel } from "@/components/review/MetadataPanel";
import { PhotosPanel } from "@/components/review/PhotosPanel";
import { AudioAnalysisPanel } from "@/components/review/AudioAnalysisPanel";
import { PDFViewer } from "@/components/review/PDFViewer";
import { ReviewNavigation } from "@/components/review/ReviewNavigation";
import { MobileZipUpload } from "@/components/review/MobileZipUpload";
import { ReviewActions } from "@/components/review/ReviewActions";
import { ReviewCommentsPanel } from "@/components/review/ReviewCommentsPanel";

const ReviewInterview = () => {
  const { auditId } = useParams<{ auditId: string }>();
  const queryClient = useQueryClient();

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
    <div className="h-screen flex">
      {/* Left Panel - Metadata & Media */}
      <div className="w-1/2 border-r border-border bg-background h-screen flex flex-col">
        {/* Sticky Header Section */}
        <div className="flex-shrink-0 sticky top-0 z-10 bg-background">
          <div className="p-6 pb-0 border-b border-border">
            <ReviewNavigation nextAuditId={nextAudit?.id} />
            
            <div className="pb-4 mt-6">
              <h1 className="text-2xl font-bold">Interview Review</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Interview ID: {audit.file_name}
              </p>
            </div>
          </div>
          
          <ReviewActions 
            auditId={auditId!} 
            currentStatus={audit.status}
            nextAuditId={nextAudit?.id}
          />
        </div>

        {/* Scrollable Content Section */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Show review comments for failed interviews */}
          <ReviewCommentsPanel 
            status={audit.status}
            reviewComment={audit.review_comment}
            actionPlan={audit.action_plan}
            reviewedAt={audit.reviewed_at}
          />
          
          {metadata ? (
            <>
              <MetadataPanel metadata={metadata} />
              <PhotosPanel photos={photos || []} auditId={auditId!} />
              <AudioAnalysisPanel metadata={metadata} />
            </>
          ) : (
            <MobileZipUpload 
              auditId={auditId!}
              onUploadSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
                queryClient.invalidateQueries({ queryKey: ["interview-metadata", auditId] });
                queryClient.invalidateQueries({ queryKey: ["interview-photos", auditId] });
              }}
            />
          )}
        </div>
      </div>

      {/* Right Panel - PDF Viewer */}
      <div className="w-1/2 h-screen overflow-hidden bg-muted/5">
        <PDFViewer pdfUrl={audit.file_url} />
      </div>
    </div>
  );
};

export default ReviewInterview;
