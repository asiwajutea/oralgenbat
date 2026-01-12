import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertCircle, ChevronDown, FileText, Smartphone } from "lucide-react";
import { format } from "date-fns";

interface ReviewCommentsPanelProps {
  status: string;
  reviewComment: string | null;
  actionPlan: string | null;
  reviewedAt: string | null;
  isReAudit?: boolean;
  artifactCorrection?: string[] | null;
}

export const ReviewCommentsPanel = ({ 
  status, 
  reviewComment, 
  actionPlan, 
  reviewedAt,
  isReAudit = false,
  artifactCorrection,
}: ReviewCommentsPanelProps) => {
  const [isOpen, setIsOpen] = useState(true);

  // Show for failed interviews OR for re-audits with previous comments
  if (status !== "Audit Failed" && !isReAudit) {
    return null;
  }

  if (!reviewComment && !actionPlan) {
    return null;
  }

  const getArtifactLabel = (artifact: string) => {
    switch (artifact) {
      case 'scanned_pdf':
        return { label: 'Scanned PDF', icon: FileText };
      case 'mobile_metadata':
        return { label: 'Mobile Metadata', icon: Smartphone };
      default:
        return { label: artifact, icon: FileText };
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-destructive">
        <CollapsibleTrigger className="w-full">
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Review Feedback
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="destructive">Failed</Badge>
                <ChevronDown 
                  className={`h-4 w-4 transition-transform duration-200 ${
                    isOpen ? '' : '-rotate-90'
                  }`} 
                />
              </div>
            </div>
            {reviewedAt && (
              <p className="text-sm text-muted-foreground text-left">
                Reviewed on {format(new Date(reviewedAt), "PPP 'at' p")}
              </p>
            )}
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0 max-h-[300px] overflow-y-auto">
            {/* Artifact Correction Display */}
            {artifactCorrection && artifactCorrection.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2">Artifacts Requiring Correction</h4>
                <div className="flex flex-wrap gap-2">
                  {artifactCorrection.map((artifact) => {
                    const { label, icon: Icon } = getArtifactLabel(artifact);
                    return (
                      <Badge key={artifact} variant="outline" className="gap-1.5 py-1">
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
            
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
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};