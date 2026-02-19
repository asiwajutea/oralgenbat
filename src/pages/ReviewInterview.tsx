import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileCheck, AlertCircle, Lock, Clock, FileText, ClipboardList, CheckCircle, XCircle, MessageCircle, Flag, ShieldCheck, ShieldOff } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ReviewTimer } from "@/components/review/ReviewTimer";
import { MarkResolvedDialog } from "@/components/tracking/MarkResolvedDialog";
import { ResolvedCommentsModal } from "@/components/tracking/ResolvedCommentsModal";
import { useInterviewLock } from "@/hooks/useInterviewLock";
import { useAuth } from "@/contexts/AuthContext";

// Ref for scrolling to checklist
type ChecklistRef = {scrollToChecklist: () => void;expandChecklist: () => void;} | null;

// Format seconds to MM:SS
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Format duration in seconds to human readable format
const formatReviewDuration = (seconds: number | null): string => {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};
const ReviewInterview = () => {
  const {
    auditId
  } = useParams<{
    auditId: string;
  }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const {
    userRole,
    user
  } = useAuth();
  const [isAnalyzingPDF, setIsAnalyzingPDF] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [completionResult, setCompletionResult] = useState<"passed" | "failed" | null>(null);

  // Resolution modal state
  const [showMarkResolvedDialog, setShowMarkResolvedDialog] = useState(false);
  const [showResolvedCommentsModal, setShowResolvedCommentsModal] = useState(
    searchParams.get("showComments") === "true"
  );

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
    setAbandoned,
    reviewStartedAt
  } = useInterviewLock(auditId);

  // Sticky detection and checklist ref
  const [isSticky, setIsSticky] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const checklistRef = useRef<HTMLDivElement>(null);

  // Mobile tab state for switching between review details and PDF
  const [mobileTab, setMobileTab] = useState<"details" | "pdf">("details");

  // Review timer - active for auditors on unreviewed interviews
  const [isTimerActive, setIsTimerActive] = useState(false);

  // Calculate initial elapsed time from review_started_at
  const initialElapsedSeconds = reviewStartedAt ?
  Math.max(0, Math.floor((Date.now() - reviewStartedAt.getTime()) / 1000)) :
  0;

  const [elapsedSeconds, setElapsedSeconds] = useState(initialElapsedSeconds);

  // Auto-load countdown for next interview
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update elapsedSeconds when reviewStartedAt changes
  useEffect(() => {
    if (reviewStartedAt) {
      const calculatedSeconds = Math.max(0, Math.floor((Date.now() - reviewStartedAt.getTime()) / 1000));
      setElapsedSeconds(calculatedSeconds);
    }
  }, [reviewStartedAt]);

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
      } = await supabase.from("audits").select("*").eq("id", auditId).maybeSingle();
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
      } = await supabase.from("interview_metadata").select("*").eq("audit_id", auditId).maybeSingle();
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
  // Query for next available interview (with metadata, not locked by others)
  const {
    data: nextAudit
  } = useQuery({
    queryKey: ["next-unreviewed-audit", auditId, user?.id],
    queryFn: async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Get audits that have metadata uploaded and are not locked by others
      const { data, error } = await supabase.
      from("audits").
      select(`
          id, 
          file_name,
          locked_by, 
          locked_at,
          interview_metadata!inner(id)
        `).
      or('status.in.(Pending,Awaiting Review),reviewed_by.is.null').
      neq("id", auditId).
      order("uploaded_at", { ascending: true });

      if (error) throw error;

      // Filter in JS to find audits not locked by others
      // Allow: not locked, lock expired, or locked by current user
      const available = data?.find((audit) => {
        const isNotLocked = !audit.locked_at;
        const isLockExpired = audit.locked_at && audit.locked_at < oneHourAgo;
        const isMyLock = audit.locked_by === user?.id;
        return isNotLocked || isLockExpired || isMyLock;
      });

      return available ? { id: available.id, file_name: available.file_name } : null;
    },
    enabled: !!auditId && !!user?.id,
    staleTime: 0, // Always get fresh data
    refetchOnMount: 'always' // Refetch when component mounts
  });

  // Fetch checklist progress - only load if reviewer_id matches current user
  // For re-audits awaiting review, clear old progress to start fresh
  const {
    data: checklistProgress,
    isLoading: checklistLoading
  } = useQuery({
    queryKey: ["checklist-progress", auditId, user?.id, audit?.is_re_audit, audit?.status],
    queryFn: async () => {
      if (!user?.id) return null;

      // For re-audits awaiting review, delete old progress and start fresh
      if (audit?.is_re_audit && audit?.status === 'Awaiting Review') {
        await supabase.
        from("audit_checklist_progress").
        delete().
        eq("audit_id", auditId);
        return null;
      }

      const {
        data,
        error
      } = await supabase.
      from("audit_checklist_progress").
      select("*").
      eq("audit_id", auditId).
      eq("reviewer_id", user.id) // Only load progress for current user
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

  // Field audit lookup from AVTool
  const { data: fieldAuditData } = useQuery({
    queryKey: ["field-audit", audit?.file_name],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-field-audit', {
        body: { file_name: audit!.file_name }
      });
      if (error) throw error;
      return data as {found: boolean;status?: string;reviewed_at?: string;reviewed_by?: string;created_at?: string;} | null;
    },
    enabled: !!audit?.file_name,
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  // Awaiting review count query (for completion page)
  const { data: awaitingCount } = useQuery({
    queryKey: ["awaiting-review-count"],
    queryFn: async () => {
      const { count, error } = await supabase.
      from("audits").
      select("id, interview_metadata!inner(id)", { count: "exact", head: true }).
      in("status", ["Pending", "Awaiting Review"]);
      if (error) throw error;
      return count || 0;
    },
    enabled: completionResult !== null
  });

  // Initialize state from saved progress
  useEffect(() => {
    if (checklistProgress?.is_completed) {
      setChecklistCompleted(true);
      setHasChecklistFailures(checklistProgress.has_failures);
      setChecklistComments(checklistProgress.failure_comments || "");
    }
  }, [checklistProgress]);

  // Reset checklist state for re-audits awaiting review
  useEffect(() => {
    if (audit?.is_re_audit && audit?.status === 'Awaiting Review') {
      setChecklistCompleted(false);
      setHasChecklistFailures(false);
      setChecklistComments("");
    }
  }, [audit?.is_re_audit, audit?.status]);
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

  // Start countdown when completion result is set and next audit is available
  useEffect(() => {
    if (completionResult && nextAudit?.id && !countdownRef.current) {
      setCountdown(5);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [completionResult, nextAudit?.id]);

  // Auto-navigate when countdown reaches 0
  useEffect(() => {
    if (completionResult && nextAudit?.id && countdown === 0) {
      cancelCountdown();
      setCompletionResult(null);
      window.location.href = `/review/${nextAudit.id}`;
    }
  }, [countdown, completionResult, nextAudit?.id]);

  const cancelCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

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
      const { data, error } = await supabase.functions.invoke('analyze-pdf', {
        body: { auditId }
      });

      // Handle any invoke errors
      if (error) {
        console.error('PDF analysis invoke error:', error);
        toast.error('Failed to analyze PDF. Please try again or use manual scoring.');
        return;
      }

      // Check if AI is unavailable (graceful degradation)
      if (data?.ai_unavailable) {
        setAiUnavailable(true);
        toast.info(data.message || "AI analysis unavailable. Please use manual scoring below.");
        return;
      }

      // Check if there was an error in the response
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      // Success
      if (data?.success) {
        toast.success('PDF analyzed successfully');
        queryClient.invalidateQueries({
          queryKey: ["interview-metadata", auditId]
        });
      }
    } catch (err) {
      console.error('PDF analysis error:', err);
      toast.error('Failed to analyze PDF. Please try again or use manual scoring.');
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

  // Check if this is a re-audit that the current user is not authorized to view
  // Only the original reviewer or admin/super_admin can access re-audits
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isReAuditRestricted = audit.is_re_audit &&
  audit.status === 'Awaiting Review' &&
  !isAdmin &&
  userRole === 'auditor';

  if (isReAuditRestricted) {
    // Fetch profile to check if current user is the original reviewer
    const isOriginalReviewer = audit.reviewed_by === user?.user_metadata?.full_name;

    if (!isOriginalReviewer) {
      return <div className="min-h-screen flex items-center justify-center">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-orange-500" />
            <h2 className="text-2xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground mb-4">
              This re-audit can only be reviewed by the original auditor ({audit.reviewed_by}) or an administrator.
            </p>
            <Button onClick={() => navigate("/interviews")}>
              Return to Interviews
            </Button>
          </div>
        </div>;
    }
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


  // Show completion page after pass/fail
  if (completionResult) {
    const isPassed = completionResult === "passed";
    const hasNextInterview = !!nextAudit?.id;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md p-8">
          {isPassed ?
          <CheckCircle className="h-16 w-16 mx-auto mb-4 text-emerald-500" /> :

          <XCircle className="h-16 w-16 mx-auto mb-4 text-destructive" />
          }
          <h2 className="text-2xl font-bold mb-2">
            Interview {isPassed ? "Passed" : "Failed"}
          </h2>
          <p className="text-muted-foreground mb-1">
            Your review has been submitted successfully.
          </p>
          {awaitingCount !== undefined &&
          <p className="text-sm font-medium text-foreground mt-4">
              {awaitingCount} {awaitingCount === 1 ? "interview" : "interviews"} awaiting review
            </p>
          }
          {hasNextInterview ?
          <div className="mt-4 mb-6">
              <p className="text-sm text-muted-foreground">
                Next interview: <span className="font-mono font-medium text-foreground">{nextAudit.file_name || nextAudit.id}</span>
              </p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <Clock className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-sm font-medium text-primary">
                  Auto-loading in {countdown}s...
                </span>
              </div>
            </div> :

          <p className="text-sm text-muted-foreground mt-4 mb-6">
              No more interviews to review.
            </p>
          }
          <div className="flex gap-3 justify-center mt-2">
            {hasNextInterview &&
            <Button onClick={() => {cancelCountdown();setCompletionResult(null);window.location.href = `/review/${nextAudit.id}`;}}>
                Go to Next Interview
              </Button>
            }
            <Button variant={hasNextInterview ? "outline" : "default"} onClick={() => {cancelCountdown();navigate("/interviews");}}>
              Go to Interviews
            </Button>
            <Button variant="outline" onClick={() => {cancelCountdown();navigate("/");}}>
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>);

  }

  return (
    <>
      <div className="h-screen flex flex-col lg:flex-row">
      {/* Mobile Tab Navigation - only visible on mobile/tablet */}
      <div className="lg:hidden flex-shrink-0 border-b bg-background sticky top-0 z-30">
        <div className="flex">
          <button
              onClick={() => setMobileTab("details")}
              className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              mobileTab === "details" ?
              "border-b-2 border-primary text-primary bg-muted/30" :
              "text-muted-foreground hover:text-foreground"}`
              }>

            <ClipboardList className="h-4 w-4" />
            Review Details
          </button>
          <button
              onClick={() => setMobileTab("pdf")}
              className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              mobileTab === "pdf" ?
              "border-b-2 border-primary text-primary bg-muted/30" :
              "text-muted-foreground hover:text-foreground"}`
              }>

            <FileText className="h-4 w-4" />
            PDF Viewer
          </button>
        </div>
      </div>

      {/* Left Panel - Metadata & Media */}
      <div className={`w-full lg:w-1/2 border-r border-border bg-background h-[calc(100vh-49px)] lg:h-screen flex flex-col ${
        mobileTab === "pdf" ? "hidden lg:flex" : "flex"}`
        }>
        {/* Non-sticky Header - Navigation & Title */}
        <div className="flex-shrink-0 p-3 sm:p-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <ReviewNavigation nextAuditId={nextAudit?.id} />
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Lock countdown timer */}
              {isAuditor && !isReviewed && isLocked && !lockedByOther && remainingSeconds > 0}
              {isAuditor && !isReviewed &&
                <ReviewTimer
                  isActive={isTimerActive}
                  initialSeconds={initialElapsedSeconds}
                  onTimeUpdate={setElapsedSeconds} />

                }
            </div>
          </div>
          <div className="mt-3 sm:mt-4">
            <h1 className="text-lg sm:text-xl font-bold">Interview Review</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <p className="text-xs text-muted-foreground font-medium truncate">
                {audit.file_name}
              </p>
              {fieldAuditData?.found ?
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] px-1.5 py-0 gap-1 flex-shrink-0">
                  <ShieldCheck className="h-3 w-3" />
                  Field Audited{fieldAuditData.reviewed_at ? ` - ${format(new Date(fieldAuditData.reviewed_at), 'MMM d, yyyy')}` : ''}
                </Badge> :
                fieldAuditData && !fieldAuditData.found ?
                <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0 gap-1 flex-shrink-0">
                  <ShieldOff className="h-3 w-3" />
                  No Field Audit
                </Badge> :
                null}
            </div>
          </div>
        </div>

        {/* Sentinel for sticky detection - placed just before sticky section */}
        <div ref={sentinelRef} className="h-0 flex-shrink-0" />

        {/* Sticky Section - Checklist & Actions only */}
        <div className="flex-shrink-0 sticky top-0 z-10 bg-background border-b border-border shadow-sm">
          {/* Audit Checklist for auditors on unreviewed interviews - only show if metadata is uploaded */}
          {isAuditor && !isReviewed && metadata && <div className="p-3 sm:p-4" ref={checklistRef}>
              <AuditChecklist auditId={auditId!} interviewId={audit.file_name} initialProgress={checklistProgress} isSticky={isSticky} onComplete={(hasFailures, comments) => {
                setChecklistCompleted(true);
                setHasChecklistFailures(hasFailures);
                setChecklistComments(comments);
              }} isCompleted={checklistCompleted} onAbandonReview={handleAbandonReview} isAbandoning={isAbandoning} />
            </div>}
          
          {/* Message when metadata not uploaded */}
          {isAuditor && !isReviewed && !metadata &&
            <div className="p-3 sm:p-4 text-center text-muted-foreground bg-muted/30 border-b">
              <p className="text-sm">Upload mobile materials to begin the audit review</p>
            </div>
            }
          
          {/* Review Actions */}
          <ReviewActions
            auditId={auditId!}
            currentStatus={audit.status}
            currentFileName={audit.file_name}
            checklistCompleted={checklistCompleted}
            hasChecklistFailures={hasChecklistFailures}
            checklistFailureComments={checklistComments}
            reviewDurationSeconds={elapsedSeconds}
            onReleaseLock={async () => { await releaseLock(); }}
            audioAnalysisComplete={!!(metadata?.family_story_duration !== undefined && metadata?.family_story_duration !== null)}
            pdfAnalysisComplete={!!(metadata?.pdf_clarity_score !== null && metadata?.pdf_clarity_score !== undefined)}
            onScrollToChecklist={() => checklistRef.current?.scrollIntoView({ behavior: 'smooth' })}
            onReviewCompleted={(result) => setCompletionResult(result)}
          />
















        </div>

        {/* Scrollable Content Section */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
          {/* Show already reviewed status */}
          {isReviewed &&
            <div className="p-3 sm:p-4 bg-muted/50 rounded-lg border">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={audit.status === "Audit Passed" ? "default" : "destructive"}>
                  {audit.status === "Audit Passed" ? "Passed" : "Failed"}
                </Badge>
                <span className="text-muted-foreground">
                  Already reviewed {(audit.re_audit_count || 0) + 1} time(s)
                  {(userRole === 'auditor' || userRole === 'admin' || userRole === 'super_admin') && (
                    <> by <span className="font-medium text-foreground">{audit.reviewed_by || "Unknown"}</span></>
                  )}
                  {audit.review_duration_seconds &&
                  <span className="text-muted-foreground"> ({formatReviewDuration(audit.review_duration_seconds)})</span>
                  }
                </span>
              </div>
            </div>
            }
          
          {/* Show review comments for failed interviews or re-audits */}
          <ReviewCommentsPanel status={audit.status} reviewComment={audit.review_comment} actionPlan={audit.action_plan} reviewedAt={audit.reviewed_at} isReAudit={audit.is_re_audit} artifactCorrection={audit.artifact_correction} />
          
          {/* Comment / Resolved button - hide for passed and ready-for-review */}
          {audit.status !== "Audit Passed" && !(audit.status === "Awaiting Review" && metadata) &&
            <div className="flex items-center gap-2">
              {audit.artifact_correction_resolved_at ?
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowResolvedCommentsModal(true)}
                className="gap-1 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50">

                  <CheckCircle className="h-3 w-3" />
                  Resolved
                  <MessageCircle className="h-3 w-3 ml-1" />
                </Button> :

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResolvedCommentsModal(true)}
                className="gap-1 border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-400 dark:hover:bg-orange-900/20">

                  <MessageCircle className="h-3 w-3" />
                  Comment
                </Button>
              }
            </div>
            }
          
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
              
              {metadata.pdf_clarity_score !== null || metadata.pdf_handwriting_legibility !== null || aiUnavailable ?
              <PDFAnalysisPanel
                metadata={metadata}
                auditId={auditId!}
                onRefresh={() => queryClient.invalidateQueries({
                  queryKey: ["interview-metadata", auditId]
                })}
                aiUnavailable={aiUnavailable} /> :


              <div className="border border-dashed border-border rounded-lg p-6 text-center">
                  <FileCheck className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <h3 className="font-medium mb-2">PDF Quality Not Analyzed</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Analyze the PDF to get clarity, legibility scores and AI feedback
                  </p>
                  <Button onClick={handleAnalyzePDF} disabled={isAnalyzingPDF} variant="outline">
                    {isAnalyzingPDF ?
                  <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing PDF...
                      </> :

                  <>
                        <FileCheck className="mr-2 h-4 w-4" />
                        Analyze PDF Quality
                      </>
                  }
                  </Button>
                </div>
              }
            </> : <MobileZipUpload
              auditId={auditId!}
              expectedFileName={audit.file_name}
              existingZipUrl={audit.mobile_zip_url}
              hasProcessingFailed={!!audit.mobile_zip_url && !metadata}
              onUploadSuccess={() => {
                queryClient.invalidateQueries({
                  queryKey: ["audit", auditId]
                });
                queryClient.invalidateQueries({
                  queryKey: ["interview-metadata", auditId]
                });
                queryClient.invalidateQueries({
                  queryKey: ["interview-photos", auditId]
                });
              }} />
            }
        </div>
      </div>

      {/* Right Panel - PDF Viewer */}
      <div className={`w-full lg:w-1/2 h-[calc(100vh-49px)] lg:h-screen overflow-hidden bg-muted/5 ${
        mobileTab === "details" ? "hidden lg:block" : "block"}`
        }>
        <PDFViewer pdfUrl={audit.file_url} />
      </div>
    </div>

      {/* Mark Resolved Dialog */}
      <MarkResolvedDialog
        open={showMarkResolvedDialog}
        onOpenChange={setShowMarkResolvedDialog}
        auditId={auditId!}
        fileName={audit.file_name} />


      {/* Resolved Comments Modal */}
      <ResolvedCommentsModal
        open={showResolvedCommentsModal}
        onOpenChange={setShowResolvedCommentsModal}
        auditId={auditId!}
        fileName={audit.file_name}
        resolvedAt={audit.artifact_correction_resolved_at}
        resolvedBy={audit.artifact_correction_resolved_by} />

    </>);

};
export default ReviewInterview;