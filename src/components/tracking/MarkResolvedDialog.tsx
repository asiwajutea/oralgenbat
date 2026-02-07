import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle } from "lucide-react";

interface MarkResolvedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auditId: string;
  fileName: string;
}

export function MarkResolvedDialog({
  open,
  onOpenChange,
  auditId,
  fileName,
}: MarkResolvedDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");

  const markAsResolvedMutation = useMutation({
    mutationFn: async () => {
      // First, update the audit to mark as resolved
      const { error: auditError } = await supabase
        .from("audits")
        .update({
          artifact_correction_resolved_at: new Date().toISOString(),
          artifact_correction_resolved_by: user?.id,
        })
        .eq("id", auditId);

      if (auditError) throw auditError;

      // If there's a comment, add it to the comments table
      if (comment.trim()) {
        const { error: commentError } = await supabase
          .from("artifact_correction_comments")
          .insert({
            audit_id: auditId,
            user_id: user?.id,
            comment: comment.trim(),
            parent_comment_id: null,
          });

        if (commentError) throw commentError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
      toast({
        title: "Marked as Resolved",
        description: "Artifact correction has been marked as resolved.",
      });
      onOpenChange(false);
      setComment("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark as resolved",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    markAsResolvedMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Mark as Resolved
          </DialogTitle>
          <DialogDescription>
            Mark artifact correction for <span className="font-mono font-medium">{fileName}</span> as resolved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="comment">Comment (Optional)</Label>
            <Textarea
              id="comment"
              placeholder="Add details about how the correction was handled (e.g., sent via email, uploaded manually)..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              This comment will be visible to other team members.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={markAsResolvedMutation.isPending}
            className="gap-2"
          >
            {markAsResolvedMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Mark Resolved
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
