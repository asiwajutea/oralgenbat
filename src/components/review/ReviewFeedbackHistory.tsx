import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, FileText, Smartphone } from "lucide-react";
import { format } from "date-fns";

interface Props {
  auditId: string;
  status: string;
  reviewComment: string | null;
  actionPlan: string | null;
  reviewedAt: string | null;
  isReAudit?: boolean;
  artifactCorrection?: string[] | null;
}

const artifactLabel = (a: string) => {
  switch (a) {
    case "scanned_pdf": return { label: "Scanned PDF", icon: FileText };
    case "mobile_metadata": return { label: "Mobile Metadata", icon: Smartphone };
    default: return { label: a, icon: FileText };
  }
};

export const ReviewFeedbackHistory = ({
  auditId,
  status,
  reviewComment,
  actionPlan,
  reviewedAt,
  isReAudit,
  artifactCorrection,
}: Props) => {
  const [open, setOpen] = useState(true);
  const [idx, setIdx] = useState(0);

  const { data: history = [] } = useQuery({
    queryKey: ["review-feedback-history", auditId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_feedback_history")
        .select("id, cycle_number, review_comment, action_plan, artifact_correction, reviewed_by, reviewed_at, created_at")
        .eq("audit_id", auditId)
        .order("cycle_number", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!auditId,
  });

  // Build entries — prefer history table; fall back to live audit fields if empty
  const entries = history.length > 0
    ? history
    : ((status === "Audit Failed" || isReAudit) && (reviewComment || actionPlan))
      ? [{
          id: "current",
          cycle_number: 1,
          review_comment: reviewComment,
          action_plan: actionPlan,
          artifact_correction: artifactCorrection || null,
          reviewed_by: null,
          reviewed_at: reviewedAt,
          created_at: reviewedAt,
        }]
      : [];

  if (entries.length === 0) return null;

  const current = entries[Math.min(idx, entries.length - 1)];
  const isLatest = idx === 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-destructive">
        <CollapsibleTrigger className="w-full">
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Review Feedback
              </CardTitle>
              <div className="flex items-center gap-2">
                {entries.length > 1 && (
                  <Badge variant="outline">{entries.length} cycles</Badge>
                )}
                <Badge variant={isLatest ? "destructive" : "secondary"}>
                  {isLatest ? "Latest" : `Cycle ${current.cycle_number}`}
                </Badge>
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
              </div>
            </div>
            {current.reviewed_at && (
              <p className="text-sm text-muted-foreground text-left">
                Reviewed on {format(new Date(current.reviewed_at), "PPP 'at' p")}
              </p>
            )}
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {entries.length > 1 && (
              <div className="flex items-center justify-between border-b pb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={idx === 0}
                  onClick={() => setIdx(i => Math.max(0, i - 1))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Newer
                </Button>
                <span className="text-xs text-muted-foreground">
                  Feedback {idx + 1} of {entries.length}
                  {" · "}Cycle {current.cycle_number}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={idx >= entries.length - 1}
                  onClick={() => setIdx(i => Math.min(entries.length - 1, i + 1))}
                >
                  Older <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}

            <div className="max-h-[320px] overflow-y-auto space-y-4">
              {current.artifact_correction && current.artifact_correction.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Artifacts Requiring Correction</h4>
                  <div className="flex flex-wrap gap-2">
                    {current.artifact_correction.map((a: string) => {
                      const { label, icon: Icon } = artifactLabel(a);
                      return (
                        <Badge key={a} variant="outline" className="gap-1.5 py-1">
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
              {current.review_comment && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Reason for Failure</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{current.review_comment}</p>
                </div>
              )}
              {current.action_plan && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Action Plan for Correction</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{current.action_plan}</p>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};