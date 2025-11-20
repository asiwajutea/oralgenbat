import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface ReviewCommentsPanelProps {
  status: string;
  reviewComment: string | null;
  actionPlan: string | null;
  reviewedAt: string | null;
}

export const ReviewCommentsPanel = ({ 
  status, 
  reviewComment, 
  actionPlan, 
  reviewedAt 
}: ReviewCommentsPanelProps) => {
  // Only show for failed interviews
  if (status !== "Audit Failed" || !reviewComment || !actionPlan) {
    return null;
  }

  return (
    <Card className="border-destructive">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Review Feedback
          </CardTitle>
          <Badge variant="destructive">Failed</Badge>
        </div>
        {reviewedAt && (
          <p className="text-sm text-muted-foreground">
            Reviewed on {format(new Date(reviewedAt), "PPP 'at' p")}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold text-sm mb-2">Reason for Failure</h4>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {reviewComment}
          </p>
        </div>
        <div>
          <h4 className="font-semibold text-sm mb-2">Action Plan for Correction</h4>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {actionPlan}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
