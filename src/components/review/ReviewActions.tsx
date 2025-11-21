import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2, Upload } from "lucide-react";
import { ReAuditDialog } from "./ReAuditDialog";

interface ReviewActionsProps {
  auditId: string;
  currentStatus: string;
  currentFileName: string;
  nextAuditId?: string;
}

export const ReviewActions = ({ auditId, currentStatus, currentFileName, nextAuditId }: ReviewActionsProps) => {
  const [showFailDialog, setShowFailDialog] = useState(false);
  const [showPassDialog, setShowPassDialog] = useState(false);
  const [showReauditDialog, setShowReauditDialog] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, userRole } = useAuth();

  const isAuditor = userRole === 'auditor' || userRole === 'admin' || userRole === 'super_admin';
  const isFieldManagerOrContractor = userRole === 'field_manager' || userRole === 'contractor';

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
        })
        .eq("id", auditId);

      if (error) throw error;

      toast({
        title: "Interview Passed",
        description: "The interview has been marked as passed.",
      });

      setShowPassDialog(false);
      queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
      
      if (nextAuditId) {
        setTimeout(() => navigate(`/review/${nextAuditId}`), 500);
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
    if (reviewComment.trim().length < 10) {
      toast({
        title: "Validation Error",
        description: "Please provide a detailed reason (at least 10 characters).",
        variant: "destructive",
      });
      return;
    }

    if (actionPlan.trim().length < 10) {
      toast({
        title: "Validation Error",
        description: "Please provide a detailed action plan (at least 10 characters).",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("audits")
        .update({
          status: "Audit Failed",
          review_comment: reviewComment,
          action_plan: actionPlan,
          reviewed_at: new Date().toISOString(),
          reviewed_by: profile?.full_name || "Unknown",
        })
        .eq("id", auditId);

      if (error) throw error;

      toast({
        title: "Interview Failed",
        description: "The interview has been marked as failed with comments.",
      });

      setShowFailDialog(false);
      setReviewComment("");
      setActionPlan("");
      queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
      
      if (nextAuditId) {
        setTimeout(() => navigate(`/review/${nextAuditId}`), 500);
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

  return (
    <>
      <div className="flex items-center gap-3 py-3 px-6 border-b border-border bg-background">
        {/* Auditors see Pass/Fail buttons */}
        {isAuditor && (
          <>
            <Button
              onClick={() => setShowPassDialog(true)}
              disabled={isReviewed || isSubmitting}
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="h-4 w-4" />
              Pass Interview
            </Button>

            <Button
              onClick={() => setShowFailDialog(true)}
              disabled={isReviewed || isSubmitting}
              variant="destructive"
              className="gap-2"
            >
              <XCircle className="h-4 w-4" />
              Fail Interview
            </Button>

            {isReviewed && (
              <span className="text-sm text-muted-foreground ml-2">
                Already reviewed: {currentStatus}
              </span>
            )}
          </>
        )}

        {/* Field Managers/Contractors see SEND FOR RE-AUDIT button for failed audits */}
        {isFieldManagerOrContractor && currentStatus === "Audit Failed" && (
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
              <Label htmlFor="action-plan">Action Plan for Correction *</Label>
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
      {isFieldManagerOrContractor && (
        <ReAuditDialog
          open={showReauditDialog}
          onOpenChange={setShowReauditDialog}
          auditId={auditId}
          currentFileName={currentFileName}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
            toast({
              title: "Success",
              description: "Interview submitted for re-audit",
            });
            setShowReauditDialog(false);
            if (nextAuditId) {
              setTimeout(() => navigate(`/review/${nextAuditId}`), 500);
            }
          }}
        />
      )}
    </>
  );
};
