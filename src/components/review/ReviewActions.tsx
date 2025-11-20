import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

interface ReviewActionsProps {
  auditId: string;
  currentStatus: string;
  nextAuditId?: string;
}

export const ReviewActions = ({ auditId, currentStatus, nextAuditId }: ReviewActionsProps) => {
  const [showFailDialog, setShowFailDialog] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isReviewed = currentStatus === "Audit Passed" || currentStatus === "Audit Failed";

  const handlePass = async () => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("audits")
        .update({
          status: "Audit Passed",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", auditId);

      if (error) throw error;

      toast({
        title: "Interview Passed",
        description: "The interview has been marked as passed.",
      });

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
        <Button
          onClick={handlePass}
          disabled={isReviewed || isSubmitting}
          className="gap-2 bg-green-600 hover:bg-green-700 text-white"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
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
      </div>

      <AlertDialog open={showFailDialog} onOpenChange={setShowFailDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Fail Interview</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide the reason for failure and an action plan for correction. Both fields are required.
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
    </>
  );
};
