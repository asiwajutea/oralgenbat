import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileCheck } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MetadataPanel } from "@/components/review/MetadataPanel";
import { PhotosPanel } from "@/components/review/PhotosPanel";
import { AudioAnalysisPanel } from "@/components/review/AudioAnalysisPanel";
import { AudioPlayerPanel } from "@/components/review/AudioPlayerPanel";
import { PDFAnalysisPanel } from "@/components/review/PDFAnalysisPanel";
import { PDFViewer } from "@/components/review/PDFViewer";
import { ReviewNavigation } from "@/components/review/ReviewNavigation";
import { MobileZipUpload } from "@/components/review/MobileZipUpload";
import { ReviewActions } from "@/components/review/ReviewActions";
import { ReviewCommentsPanel } from "@/components/review/ReviewCommentsPanel";
import { ReAuditHistory } from "@/components/review/ReAuditHistory";
import { AuditChecklist, ChecklistProgress } from "@/components/review/AuditChecklist";
import { useAuth } from "@/contexts/AuthContext";

const ReviewInterview = () => {
  const { auditId } = useParams<{ auditId: string }>();
  const queryClient = useQueryClient();
  const { userRole } = useAuth();
  const [isAnalyzingPDF, setIsAnalyzingPDF] = useState(false);
  
  // Checklist state
  const [checklistCompleted, setChecklistCompleted] = useState(false);
  const [hasChecklistFailures, setHasChecklistFailures] = useState(false);
  const [checklistComments, setChecklistComments] = useState("");
  
  const isAuditor = userRole === 'auditor' || userRole === 'admin' || userRole === 'super_admin';

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

  // Fetch checklist progress
  const { data: checklistProgress, isLoading: checklistLoading } = useQuery({
    queryKey: ["checklist-progress", auditId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_checklist_progress")
        .select("*")
        .eq("audit_id", auditId)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      // Transform database response to match ChecklistProgress type
      return {
        ...data,
        items: data.items as unknown as ChecklistProgress["items"]
      } as ChecklistProgress;
    },
    enabled: !!auditId && isAuditor,
  });

  // Initialize state from saved progress
  useEffect(() => {
    if (checklistProgress?.is_completed) {
      setChecklistCompleted(true);
      setHasChecklistFailures(checklistProgress.has_failures);
      setChecklistComments(checklistProgress.failure_comments || "");
    }
  }, [checklistProgress]);

  const isLoading = auditLoading || metadataLoading || photosLoading || (isAuditor && checklistLoading);

  const handleAnalyzePDF = async () => {
    if (!auditId) return;
    
    setIsAnalyzingPDF(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-pdf', {
        body: { auditId }
      });
      
      if (error) throw error;
      
      toast.success('PDF analyzed successfully');
      queryClient.invalidateQueries({ queryKey: ["interview-metadata", auditId] });
    } catch (error) {
      console.error('PDF analysis error:', error);
      toast.error('Failed to analyze PDF. Please try again.');
    } finally {
      setIsAnalyzingPDF(false);
    }
  };

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
          
          {/* Audit Checklist for auditors on unreviewed interviews */}
          {isAuditor && audit.status !== "Audit Passed" && audit.status !== "Audit Failed" && (
            <div className="p-4 border-b border-border">
              <AuditChecklist
                auditId={auditId!}
                initialProgress={checklistProgress}
                onComplete={(hasFailures, comments) => {
                  setChecklistCompleted(true);
                  setHasChecklistFailures(hasFailures);
                  setChecklistComments(comments);
                }}
                isCompleted={checklistCompleted}
              />
            </div>
          )}
          
          <ReviewActions 
            auditId={auditId!} 
            currentStatus={audit.status}
            currentFileName={audit.file_name}
            nextAuditId={nextAudit?.id}
            checklistCompleted={checklistCompleted || audit.status === "Audit Passed" || audit.status === "Audit Failed"}
            hasChecklistFailures={hasChecklistFailures}
            checklistFailureComments={checklistComments}
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
          
          {/* Show re-audit history if exists */}
          {audit.is_re_audit && <ReAuditHistory auditId={auditId!} />}
          
          {metadata ? (
            <>
              <MetadataPanel metadata={metadata} />
              <PhotosPanel photos={photos || []} auditId={auditId!} />
              
              {/* Show Audio Player for manual verification if audio URLs exist and not yet confirmed */}
              {metadata.family_story_audio_url && 
               metadata.pedigree_segment_audio_url && 
               !metadata.duration_manually_confirmed ? (
                <AudioPlayerPanel
                  auditId={auditId!}
                  familyStoryUrl={metadata.family_story_audio_url}
                  pedigreeUrl={metadata.pedigree_segment_audio_url}
                  onDurationConfirmed={() => {
                    queryClient.invalidateQueries({ queryKey: ["interview-metadata", auditId] });
                  }}
                />
              ) : (
                <AudioAnalysisPanel metadata={metadata} />
              )}
              
              {(metadata.pdf_clarity_score !== null || metadata.pdf_handwriting_legibility !== null) ? (
                <PDFAnalysisPanel metadata={metadata} />
              ) : (
                <div className="border border-dashed border-border rounded-lg p-6 text-center">
                  <FileCheck className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <h3 className="font-medium mb-2">PDF Quality Not Analyzed</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Analyze the PDF to get clarity, legibility scores and AI feedback
                  </p>
                  <Button 
                    onClick={handleAnalyzePDF} 
                    disabled={isAnalyzingPDF}
                    variant="outline"
                  >
                    {isAnalyzingPDF ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing PDF...
                      </>
                    ) : (
                      <>
                        <FileCheck className="mr-2 h-4 w-4" />
                        Analyze PDF Quality
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <MobileZipUpload 
              auditId={auditId!}
              expectedFileName={audit.file_name}
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
