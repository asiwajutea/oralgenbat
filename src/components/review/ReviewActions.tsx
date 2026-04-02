import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2, Upload, FileText, Smartphone, ClipboardList } from "lucide-react";
import { ReAuditDialog } from "./ReAuditDialog";

const CHECKLIST_FEEDBACK_STATEMENTS: Record<number, string> = {
  // A. Form & Document Review
  0: "The interview failed because there is no proof that the interview was audited by the Field Manager.",
  1: "The interview was not recorded on the FSI Standard Interview Collection Form or an incorrect form was submitted. Please ensure the interview is properly documented using the approved FSI Standard Interview Collection Form and resubmit for review.",
  2: "The Authorization Form is incomplete, missing a signature and/or date, or a required witness signature is absent where \"X\" was used. Please obtain all required signatures and dates and resubmit the completed Authorization Form.",
  3: "The Field Manager Checklist was not fully completed and/or signed. Please ensure all required checklist items are checked and the form is properly signed before resubmission.",
  4: "The pages are not numbered correctly or are out of sequence. Please renumber the pages in the correct order and ensure the full document is complete before resubmission.",
  // B. Data Cross-Check
  5: "The interviewee's name and/or age on the collection form header and Authorization Form do not match the information recorded in the mobile app. Please correct the discrepancies so all records are consistent and resubmit for review.",
  6: "The total number of names recorded on the form header does not match the total number of names written on the collection form or the Mobile App data. Please reconcile the counts and update the documentation accordingly.",
  7: "The folder name recorded on the collection form header does not match the interview date and/or interview ID. Please correct the folder naming to reflect the accurate interview details.",
  8: "The earliest ancestor's name on the collection form does not match the information entered in the mobile app. Please review and correct the ancestor details so both records align.",
  9: "The dates and/or places of birth for the interviewee, spouse, or children are missing or incomplete. Please provide complete birth information for all required individuals and resubmit the interview.",
  10: "One or more individuals listed on the collection form are missing a unique RIN, relationship code, and/or gender, or the information is duplicated or incorrect. Please ensure all required identifiers are accurately completed for every individual.",
  // C. Media Verification
  11: "One or more photos uploaded in the mobile app are unclear, incomplete, irrelevant, or improperly captured. Please retake and upload clear, complete, and relevant photos as required.",
  12: "The Authorization Form image is incomplete, unclear, or partially obscured, making it unreadable. Please upload a clear image showing the full Authorization Form.",
  13: "The audio recordings are unclear, incomplete, or inaudible, making it difficult to hear the Field Agent and/or interviewee. Please ensure all required audio recordings are clear and fully audible before resubmission.",
};

const parseChecklistFeedback = (rawComments: string): string => {
  const lines = rawComments.split('\n');
  const failures: Array<{questionId: number; additionalComment?: string}> = [];
  let currentQuestionId: number | null = null;

  for (const line of lines) {
    const questionMatch = line.match(/^-\s*Q(\d+):/);
    if (questionMatch) {
      if (currentQuestionId !== null) {
        failures.push({ questionId: currentQuestionId });
      }
      currentQuestionId = parseInt(questionMatch[1]);
    } else if (currentQuestionId !== null) {
      const commentMatch = line.match(/^\s*Comment:\s*(.+)/i);
      if (commentMatch && commentMatch[1].trim()) {
        failures.push({ questionId: currentQuestionId, additionalComment: commentMatch[1].trim() });
        currentQuestionId = null;
      }
    }
  }

  if (currentQuestionId !== null) {
    failures.push({ questionId: currentQuestionId });
  }

  if (failures.length === 0) return rawComments;

  return failures.map(f => {
    const statement = CHECKLIST_FEEDBACK_STATEMENTS[f.questionId] || `Q${f.questionId}: Failed`;
    let result = `Q${f.questionId}: ${statement}`;
    if (f.additionalComment) {
      result += `\nAdditional Comment: ${f.additionalComment}`;
    }
    return result;
  }).join('\n\n');
};

interface ReviewActionsProps {
  auditId: string;
  currentStatus: string;
  currentFileName: string;
  checklistCompleted?: boolean;
  hasChecklistFailures?: boolean;
  checklistFailureComments?: string;
  reviewDurationSeconds?: number;
  onReleaseLock?: () => Promise<void>;
  audioAnalysisComplete?: boolean;
  pdfAnalysisComplete?: boolean;
  onScrollToChecklist?: () => void;
  onReviewCompleted?: (result: "passed" | "failed") => void;
}

export const ReviewActions = ({ 
  auditId, 
  currentStatus, 
  currentFileName, 
  checklistCompleted = false,
  hasChecklistFailures = false,
  checklistFailureComments = "",
  reviewDurationSeconds,
  onReleaseLock,
  audioAnalysisComplete = false,
  pdfAnalysisComplete = false,
  onScrollToChecklist,
  onReviewCompleted,
}: ReviewActionsProps) => {
  const [showFailDialog, setShowFailDialog] = useState(false);
  const [showPassDialog, setShowPassDialog] = useState(false);
  const [showReauditDialog, setShowReauditDialog] = useState(false);
  const [reviewComment, setReviewComment] = useState(checklistFailureComments);
  const [actionPlan, setActionPlan] = useState("");
  const [artifactCorrection, setArtifactCorrection] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const { profile, userRole } = useAuth();

  // Update reviewComment when checklistFailureComments changes
  useEffect(() => {
    if (checklistFailureComments) {
      setReviewComment(parseChecklistFeedback(checklistFailureComments));
    }
  }, [checklistFailureComments]);

  const isAuditor = userRole === 'auditor' || userRole === 'admin' || userRole === 'super_admin';
  const isFieldManagerOrContractor = userRole === 'field_manager' || userRole === 'contractor';
  const canSubmitReaudit = userRole === 'field_manager' || userRole === 'contractor' || userRole === 'admin' || userRole === 'super_admin';

  const isReviewed = currentStatus === "Audit Passed" || currentStatus === "Audit Failed";

  const handlePass = async () => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("audits")
        .update({
          status: "Audit Passed",
          reviewed_at: new Date().toISOString(),
          reviewed_by: profile?.full_name || "Unknown",
          review_duration_seconds: reviewDurationSeconds || null,
          locked_by: null,
          locked_at: null,
          review_started_at: null, // Clear timer on completion
        })
        .eq("id", auditId);

      if (error) throw error;

      // Release lock
      if (onReleaseLock) {
        await onReleaseLock();
      }

      // Cleanup audio files after passing
      try {
        await supabase.functions.invoke('cleanup-interview-audio', {
          body: { auditId }
        });
        console.log("Audio files cleaned up successfully");
      } catch (cleanupError) {
        console.warn("Audio cleanup failed (non-critical):", cleanupError);
      }

      // Delete checklist progress after passing
      try {
        await supabase
          .from("audit_checklist_progress")
          .delete()
          .eq("audit_id", auditId);
        console.log("Checklist progress deleted for passed audit");
      } catch (cleanupError) {
        console.warn("Checklist cleanup failed (non-critical):", cleanupError);
      }

      toast({
        title: "Interview Passed",
        description: "The interview has been marked as passed.",
      });

      setShowPassDialog(false);
      
      // Invalidate queries for proper refresh
      queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
      queryClient.invalidateQueries({ queryKey: ["status-counts"] });
      queryClient.invalidateQueries({ queryKey: ["next-unreviewed-audit"] });
      queryClient.invalidateQueries({ queryKey: ["audits"] });
      
      if (onReviewCompleted) {
        onReviewCompleted("passed");
      }
    } catch (error) {
      console.error("Error passing interview:", error);
      toast({
        title: "Error",
        description: "Failed to update interview status.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFailSubmit = async () => {
    if (artifactCorrection.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one artifact that needs correction.",
        variant: "destructive",
      });
      return;
    }

    if (reviewComment.trim().length < 10) {
      toast({
        title: "Validation Error",
        description: "Please provide a detailed reason (at least 10 characters).",
        variant: "destructive",
      });
      return;
    }

    // Action plan is optional - no validation required

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("audits")
        .update({
          status: "Audit Failed",
          review_comment: reviewComment,
          action_plan: actionPlan,
          artifact_correction: artifactCorrection,
          reviewed_at: new Date().toISOString(),
          reviewed_by: profile?.full_name || "Unknown",
          review_duration_seconds: reviewDurationSeconds || null,
          locked_by: null,
          locked_at: null,
          review_started_at: null, // Clear timer on completion
        })
        .eq("id", auditId);

      if (error) throw error;

      // Release lock
      if (onReleaseLock) {
        await onReleaseLock();
      }

      // Cleanup audio files after failing
      try {
        await supabase.functions.invoke('cleanup-interview-audio', {
          body: { auditId }
        });
        console.log("Audio files cleaned up successfully");
      } catch (cleanupError) {
        console.warn("Audio cleanup failed (non-critical):", cleanupError);
      }

      toast({
        title: "Interview Failed",
        description: "The interview has been marked as failed with comments.",
      });

      setShowFailDialog(false);
      setReviewComment("");
      setActionPlan("");
      setArtifactCorrection([]);
      
      // Invalidate queries for proper refresh
      queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
      queryClient.invalidateQueries({ queryKey: ["status-counts"] });
      queryClient.invalidateQueries({ queryKey: ["next-unreviewed-audit"] });
      queryClient.invalidateQueries({ queryKey: ["audits"] });
      
      if (onReviewCompleted) {
        onReviewCompleted("failed");
      }
    } catch (error) {
      console.error("Error failing interview:", error);
      toast({
        title: "Error",
        description: "Failed to update interview status.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleArtifact = (artifact: string, checked: boolean) => {
    if (checked) {
      setArtifactCorrection([...artifactCorrection, artifact]);
    } else {
      setArtifactCorrection(artifactCorrection.filter(a => a !== artifact));
    }
  };

  // Determine if we should show auditor buttons
  const showAuditorButtons = isAuditor && !isReviewed && checklistCompleted;
  const analysisComplete = audioAnalysisComplete && pdfAnalysisComplete;
  const canPass = showAuditorButtons && analysisComplete;
  const canFail = showAuditorButtons && analysisComplete;
  const [showPassOverrideDialog, setShowPassOverrideDialog] = useState(false);
  const [passOverrideReason, setPassOverrideReason] = useState("");
  const [passOverrideActionPlan, setPassOverrideActionPlan] = useState("");

  return (
    <>
      <div className="flex items-center gap-3 py-3 px-6 border-b border-border bg-background">
        {/* Auditors see Pass/Fail buttons after checklist is complete */}
        {isAuditor && !isReviewed && (
          <>
            {!checklistCompleted ? (
              <span className="text-sm text-muted-foreground">
                Complete the checklist to review this interview
              </span>
            ) : (
              <>
                {canPass && (
                  <Button
                    onClick={() => setShowPassDialog(true)}
                    disabled={isSubmitting}
                    className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Pass Interview
                  </Button>
                )}

                {canFail && (
                  <Button
                    onClick={() => setShowFailDialog(true)}
                    disabled={isSubmitting}
                    variant="destructive"
                    className="gap-2"
                  >
                    <XCircle className="h-4 w-4" />
                    Fail Interview
                  </Button>
                )}

                {/* Review Checklist button - shown when can fail but there are failures */}
                {hasChecklistFailures && onScrollToChecklist && (
                  <Button
                    onClick={onScrollToChecklist}
                    variant="outline"
                    className="gap-2"
                  >
                    <ClipboardList className="h-4 w-4" />
                    Review Checklist
                  </Button>
                )}

                {hasChecklistFailures && (
                  <span className="text-sm text-amber-600 ml-2">
                    Checklist has failed items - interview cannot pass
                  </span>
                )}

                {/* Show warning if analysis not complete */}
                {showAuditorButtons && !analysisComplete && (
                  <span className="text-sm text-orange-600 ml-2">
                    Complete audio &amp; PDF analysis before passing/failing
                  </span>
                )}
              </>
            )}
          </>
        )}

        {isAuditor && isReviewed && (
          <span className="text-sm text-muted-foreground">
            Already reviewed: {currentStatus}
          </span>
        )}

        {/* Field Managers/Contractors see SEND FOR RE-AUDIT button for failed audits */}
        {canSubmitReaudit && currentStatus === "Audit Failed" && (
          <Button
            onClick={() => setShowReauditDialog(true)}
            disabled={isSubmitting}
            className="gap-2 bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Upload className="h-4 w-4" />
            SEND FOR RE-AUDIT
          </Button>
        )}

        {/* Show status for non-auditors if reviewed */}
        {!isAuditor && isReviewed && (
          <span className="text-sm text-muted-foreground">
            Status: {currentStatus}
          </span>
        )}
      </div>

      <AlertDialog open={showFailDialog} onOpenChange={setShowFailDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Fail Interview</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide the reason for failure and an action plan for correction. This will be recorded as reviewed by {profile?.full_name}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            {/* Artifact Correction Selection */}
            <div className="space-y-3">
              <Label>Which artifact(s) need correction? *</Label>
              <div className="flex flex-col gap-3">
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <Checkbox
                    id="scanned-pdf"
                    checked={artifactCorrection.includes('scanned_pdf')}
                    onCheckedChange={(checked) => toggleArtifact('scanned_pdf', !!checked)}
                  />
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="scanned-pdf" className="cursor-pointer font-medium">
                      Scanned PDF
                    </Label>
                  </div>
                </div>
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <Checkbox
                    id="mobile-metadata"
                    checked={artifactCorrection.includes('mobile_metadata')}
                    onCheckedChange={(checked) => toggleArtifact('mobile_metadata', !!checked)}
                  />
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="mobile-metadata" className="cursor-pointer font-medium">
                      Mobile Metadata
                    </Label>
                  </div>
                </div>
                <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                  <Checkbox
                    id="no-field-audit"
                    checked={artifactCorrection.includes('no_field_audit')}
                    onCheckedChange={(checked) => toggleArtifact('no_field_audit', !!checked)}
                  />
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="no-field-audit" className="cursor-pointer font-medium">
                      No Proof of Field Audit
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="review-comment">Reason for Failure *</Label>
              <Textarea
                id="review-comment"
                placeholder="Describe why this interview failed..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="action-plan">Action Plan for Correction (Optional)</Label>
              <Textarea
                id="action-plan"
                placeholder="Describe the steps needed to correct this issue..."
                value={actionPlan}
                onChange={(e) => setActionPlan(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleFailSubmit}
              disabled={isSubmitting}
              variant="destructive"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                "Submit Failure Report"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pass Confirmation Dialog */}
      <AlertDialog open={showPassDialog} onOpenChange={setShowPassDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Pass Interview</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this interview as passed? This will be recorded as reviewed by {profile?.full_name}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePass} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Passing...
                </>
              ) : (
                "Confirm Pass"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Re-Audit Dialog for Field Managers/Contractors */}
      {canSubmitReaudit && (
        <ReAuditDialog
          open={showReauditDialog}
          onOpenChange={setShowReauditDialog}
          auditId={auditId}
          currentFileName={currentFileName}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
            queryClient.invalidateQueries({ queryKey: ["status-counts"] });
            queryClient.invalidateQueries({ queryKey: ["next-unreviewed-audit"] });
            queryClient.invalidateQueries({ queryKey: ["audits"] });
            toast({
              title: "Success",
              description: "Interview submitted for re-audit",
            });
            setShowReauditDialog(false);
          }}
        />
      )}
    </>
  );
};