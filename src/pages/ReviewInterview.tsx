import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileCheck, AlertCircle, Lock, Clock } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useReviewTimer } from "@/components/review/ReviewTimer";
import { useInterviewLock } from "@/hooks/useInterviewLock";
import { useAuth } from "@/contexts/AuthContext";

// Ref for scrolling to checklist
type ChecklistRef = { scrollToChecklist: () => void; expandChecklist: () => void } | null;

// Format seconds to MM:SS
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
const ReviewInterview = () => {
  const {
    auditId
  } = useParams<{
    auditId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    userRole,
    user
  } = useAuth();
  const [isAnalyzingPDF, setIsAnalyzingPDF] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);

  // Checklist state
  const [checklistCompleted, setChecklistCompleted] = useState(false);
  const [hasChecklistFailures, setHasChecklistFailures] = useState(false);
  const [checklistComments, setChecklistComments] = useState("");
  const isAuditor = userRole === 'auditor' || userRole === 'admin' || userRole === 'super_admin';

  // Interview locking
  const {
    isLocked,
    lockedByOther,
    remainingSeconds,
    acquireLock,
    releaseLock,
    isLoading: lockLoading,
    hasAbandoned,
    setAbandoned
  } = useInterviewLock(auditId);

  // Sticky detection and checklist ref
  const [isSticky, setIsSticky] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const checklistRef = useRef<HTMLDivElement>(null);

  // Review timer - active for auditors on unreviewed interviews
  const [isTimerActive, setIsTimerActive] = useState(false);
  const {
    elapsedSeconds,
    Timer
  } = useReviewTimer(isTimerActive);

  // Intersection Observer to detect when sticky is activated
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      // When sentinel is NOT visible, the sticky content is "stuck"
      setIsSticky(!entry.isIntersecting);
    }, {
      threshold: 0,
      rootMargin: "-1px 0px 0px 0px"
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  const {
    data: audit,
    isLoading: auditLoading
  } = useQuery({
    queryKey: ["audit", auditId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("audits").select("*").eq("id", auditId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!auditId
  });
  const {
    data: metadata,
    isLoading: metadataLoading
  } = useQuery({
    queryKey: ["interview-metadata", auditId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("interview_metadata").select("*").eq("audit_id", auditId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!auditId
  });
  const {
    data: photos,
    isLoading: photosLoading
  } = useQuery({
    queryKey: ["interview-photos", auditId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("interview_photos").select("*").eq("audit_id", auditId).order("display_order", {
        ascending: true
      });
      if (error) throw error;
      return data;
    },
    enabled: !!auditId
  });
  const {
    data: nextAudit
  } = useQuery({
    queryKey: ["next-unreviewed-audit", auditId],
    queryFn: async () => {
      const {
        data,
        error
      } = await supabase.from("audits").select("id").or('status.in.(Pending,Awaiting Review),reviewed_by.is.null').neq("id", auditId).order("uploaded_at", {
        ascending: true
      }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!auditId
  });

  // Fetch checklist progress - only load if reviewer_id matches current user
  const {
    data: checklistProgress,
    isLoading: checklistLoading
  } = useQuery({
    queryKey: ["checklist-progress", auditId, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const {
        data,
        error
      } = await supabase
        .from("audit_checklist_progress")
        .select("*")
        .eq("audit_id", auditId)
        .eq("reviewer_id", user.id) // Only load progress for current user
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;

      // Transform database response to match ChecklistProgress type
      return {
        ...data,
        items: data.items as unknown as ChecklistProgress["items"]
      } as ChecklistProgress;
    },
    enabled: !!auditId && isAuditor && !!user?.id
  });

  // Initialize state from saved progress
  useEffect(() => {
    if (checklistProgress?.is_completed) {
      setChecklistCompleted(true);
      setHasChecklistFailures(checklistProgress.has_failures);
      setChecklistComments(checklistProgress.failure_comments || "");
    }
  }, [checklistProgress]);
  const isLoading = auditLoading || metadataLoading || photosLoading || lockLoading || isAuditor && checklistLoading;
  const isReviewed = audit?.status === "Audit Passed" || audit?.status === "Audit Failed";

  // Acquire lock and start timer for auditors on unreviewed interviews when data loads
  // Only start if metadata is available
  useEffect(() => {
    const initLock = async () => {
      // Don't acquire if abandoned
      if (hasAbandoned) return;
      // Only acquire lock and start timer if metadata is uploaded
      if (audit && isAuditor && !isReviewed && !lockedByOther && metadata) {
        const acquired = await acquireLock();
        if (acquired) {
          setIsTimerActive(true);
        }
      }
    };
    initLock();
  }, [audit, isAuditor, isReviewed, lockedByOther, acquireLock, hasAbandoned, metadata]);

  // Handle abandon review
  const handleAbandonReview = async () => {
    setIsAbandoning(true);
    try {
      await releaseLock();
      setAbandoned(true); // Mark as abandoned to prevent re-locking
      toast.success("Review abandoned. Interview is now available to other auditors.");
      navigate("/");
    } finally {
      setIsAbandoning(false);
    }
  };
  const handleAnalyzePDF = async () => {
    if (!auditId) return;
    setIsAnalyzingPDF(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('analyze-pdf', {
        body: {
          auditId
        }
      });
      if (error) throw error;
      toast.success('PDF analyzed successfully');
      queryClient.invalidateQueries({
        queryKey: ["interview-metadata", auditId]
      });
    } catch (error) {
      console.error('PDF analysis error:', error);
      toast.error('Failed to analyze PDF. Please try again.');
    } finally {
      setIsAnalyzingPDF(false);
    }
  };
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>;
  }
  if (!audit) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Audit Not Found</h2>
          <p className="text-muted-foreground">The requested audit could not be found.</p>
        </div>
      </div>;
  }

  // Show blocked message if locked by another user
  if (lockedByOther && !isReviewed) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-orange-500" />
          <h2 className="text-2xl font-semibold mb-2">Interview In Progress</h2>
          <p className="text-muted-foreground mb-4">
            This interview is currently being reviewed by another auditor. Please try again later or select a different interview.
          </p>
          <Button onClick={() => navigate("/")}>
            Return to Dashboard
          </Button>
        </div>
      </div>;
  }

  // Show message if user abandoned this review
  if (hasAbandoned && !isReviewed) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-amber-500" />
          <h2 className="text-2xl font-semibold mb-2">Review Abandoned</h2>
          <p className="text-muted-foreground mb-4">
            You abandoned this review. Select a different interview or return to this one from the dashboard.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => {
            setAbandoned(false);
            window.location.reload();
          }}>
              Resume Review
            </Button>
            <Button onClick={() => navigate("/")}>
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>;
  }
  return <div className="h-screen flex">
      {/* Left Panel - Metadata & Media */}
      <div className="w-1/2 border-r border-border bg-background h-screen flex flex-col">
        {/* Non-sticky Header - Navigation & Title */}
        <div className="flex-shrink-0 p-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <ReviewNavigation nextAuditId={nextAudit?.id} />
            <div className="flex items-center gap-3">
              {/* Lock countdown timer */}
              {isAuditor && !isReviewed && isLocked && !lockedByOther && remainingSeconds > 0}
              {isAuditor && !isReviewed && Timer}
            </div>
          </div>
          <div className="mt-4">
            <h1 className="text-xl font-bold">Interview Review</h1>
            <p className="text-xs mt-0.5 text-muted-foreground font-medium">
              {audit.file_name}
            </p>
          </div>
        </div>

        {/* Sentinel for sticky detection - placed just before sticky section */}
        <div ref={sentinelRef} className="h-0 flex-shrink-0" />

        {/* Sticky Section - Checklist & Actions only */}
        <div className="flex-shrink-0 sticky top-0 z-10 bg-background border-b border-border shadow-sm">
          {/* Audit Checklist for auditors on unreviewed interviews - only show if metadata is uploaded */}
          {isAuditor && !isReviewed && metadata && <div className="p-4" ref={checklistRef}>
              <AuditChecklist auditId={auditId!} interviewId={audit.file_name} initialProgress={checklistProgress} isSticky={isSticky} onComplete={(hasFailures, comments) => {
            setChecklistCompleted(true);
            setHasChecklistFailures(hasFailures);
            setChecklistComments(comments);
          }} isCompleted={checklistCompleted} onAbandonReview={handleAbandonReview} isAbandoning={isAbandoning} />
            </div>}
          
          {/* Message when metadata not uploaded */}
          {isAuditor && !isReviewed && !metadata && (
            <div className="p-4 text-center text-muted-foreground bg-muted/30 border-b">
              <p className="text-sm">Upload mobile materials to begin the audit review</p>
            </div>
          )}
          
          {/* Review Actions */}
          <ReviewActions
            auditId={auditId!}
            currentStatus={audit.status}
            currentFileName={audit.file_name}
            nextAuditId={nextAudit?.id}
            checklistCompleted={checklistCompleted}
            hasChecklistFailures={hasChecklistFailures}
            checklistFailureComments={checklistComments}
            reviewDurationSeconds={elapsedSeconds}
            onReleaseLock={releaseLock}
            audioAnalysisComplete={metadata?.duration_manually_confirmed === true}
            pdfAnalysisComplete={metadata?.pdf_clarity_score !== null && metadata?.pdf_clarity_score !== undefined}
            onScrollToChecklist={() => {
              checklistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        </div>

        {/* Scrollable Content Section */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Show review comments for failed interviews or re-audits */}
          <ReviewCommentsPanel status={audit.status} reviewComment={audit.review_comment} actionPlan={audit.action_plan} reviewedAt={audit.reviewed_at} isReAudit={audit.is_re_audit} artifactCorrection={audit.artifact_correction} />
          
          {/* Show re-audit history if exists */}
          {audit.is_re_audit && <ReAuditHistory auditId={auditId!} />}
          
          {metadata ? <>
              <MetadataPanel metadata={metadata} />
              <PhotosPanel photos={photos || []} auditId={auditId!} />
              
              {/* Show Audio Player for manual verification if audio URLs exist and not yet confirmed */}
              {metadata.family_story_audio_url && metadata.pedigree_segment_audio_url && !metadata.duration_manually_confirmed ? <AudioPlayerPanel auditId={auditId!} familyStoryUrl={metadata.family_story_audio_url} pedigreeUrl={metadata.pedigree_segment_audio_url} onDurationConfirmed={() => {
            queryClient.invalidateQueries({
              queryKey: ["interview-metadata", auditId]
            });
          }} /> : <AudioAnalysisPanel metadata={metadata} />}
              
              {metadata.pdf_clarity_score !== null || metadata.pdf_handwriting_legibility !== null ? <PDFAnalysisPanel metadata={metadata} auditId={auditId!} onRefresh={() => queryClient.invalidateQueries({
            queryKey: ["interview-metadata", auditId]
          })} /> : <div className="border border-dashed border-border rounded-lg p-6 text-center">
                  <FileCheck className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <h3 className="font-medium mb-2">PDF Quality Not Analyzed</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Analyze the PDF to get clarity, legibility scores and AI feedback
                  </p>
                  <Button onClick={handleAnalyzePDF} disabled={isAnalyzingPDF} variant="outline">
                    {isAnalyzingPDF ? <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing PDF...
                      </> : <>
                        <FileCheck className="mr-2 h-4 w-4" />
                        Analyze PDF Quality
                      </>}
                  </Button>
                </div>}
            </> : <MobileZipUpload auditId={auditId!} expectedFileName={audit.file_name} onUploadSuccess={() => {
          queryClient.invalidateQueries({
            queryKey: ["audit", auditId]
          });
          queryClient.invalidateQueries({
            queryKey: ["interview-metadata", auditId]
          });
          queryClient.invalidateQueries({
            queryKey: ["interview-photos", auditId]
          });
        }} />}
        </div>
      </div>

      {/* Right Panel - PDF Viewer */}
      <div className="w-1/2 h-screen overflow-hidden bg-muted/5">
        <PDFViewer pdfUrl={audit.file_url} />
      </div>
    </div>;
};
export default ReviewInterview;