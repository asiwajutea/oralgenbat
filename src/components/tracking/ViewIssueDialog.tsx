import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, FileText, CheckCircle, Loader2, Calendar, User } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface ViewIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interview: {
    id: string;
    file_name: string;
    file_url: string | null;
    issue_comment: string | null;
    flagged_at: string | null;
    flagged_by: string | null;
    assignment_id: string | null;
  } | null;
  onResolve: (assignmentId: string, comment?: string) => Promise<void>;
  isResolving?: boolean;
}

export const ViewIssueDialog = ({
  open,
  onOpenChange,
  interview,
  onResolve,
  isResolving = false,
}: ViewIssueDialogProps) => {
  const [resolveComment, setResolveComment] = useState("");

  // Fetch the user's name who flagged the issue using security definer function
  const { data: flaggedByName } = useQuery({
    queryKey: ["user-display-name", interview?.flagged_by],
    queryFn: async () => {
      if (!interview?.flagged_by) return "Unknown User";
      
      const { data, error } = await supabase
        .rpc("get_user_display_name", { _user_id: interview.flagged_by });
      
      if (error) {
        console.error("Error fetching user name:", error);
        return "Unknown User";
      }
      return data || "Unknown User";
    },
    enabled: !!interview?.flagged_by && open,
  });

  const handleResolve = async () => {
    if (!interview?.assignment_id) return;
    await onResolve(interview.assignment_id, resolveComment.trim() || undefined);
    setResolveComment("");
    onOpenChange(false);
  };

  const handleOpenPdf = () => {
    if (interview?.file_url) {
      window.open(interview.file_url, "_blank");
    }
  };

  if (!interview) return null;

  const displayName = flaggedByName || "Unknown User";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Flagged Issue
          </DialogTitle>
          <DialogDescription>
            Review and resolve the issue flagged by data entry
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Interview Info */}
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-sm text-muted-foreground mb-1">Interview ID</p>
            <p className="font-mono font-medium">{interview.file_name}</p>
          </div>

          {/* Flagged Date */}
          {interview.flagged_at && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                Flagged on {format(new Date(interview.flagged_at), "MMM d, yyyy 'at' h:mm a")}
              </span>
            </div>
          )}

          {/* Issue Message */}
          <div>
            <Label className="text-sm font-medium flex items-center gap-2 mb-2">
              <User className="h-4 w-4" />
              Issue flagged by <span className="text-primary font-semibold">{displayName}</span>
            </Label>
            <div className="rounded-lg border p-3 bg-destructive/5 border-destructive/20">
              <p className="text-sm whitespace-pre-wrap">
                {interview.issue_comment || "No comment provided"}
              </p>
            </div>
          </div>

          {/* View PDF Button */}
          {interview.file_url && (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleOpenPdf}
            >
              <FileText className="h-4 w-4" />
              View Interview PDF
            </Button>
          )}

          {/* Resolve Comment */}
          <div>
            <Label htmlFor="resolve-comment" className="text-sm font-medium">
              Response (Optional)
            </Label>
            <Textarea
              id="resolve-comment"
              placeholder="Add a comment explaining how the issue was resolved..."
              value={resolveComment}
              onChange={(e) => setResolveComment(e.target.value)}
              className="mt-1.5"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleResolve}
            disabled={isResolving}
            className="gap-2"
          >
            {isResolving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Resolve Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
