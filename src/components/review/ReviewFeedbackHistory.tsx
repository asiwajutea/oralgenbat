import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, FileText, Smartphone, Activity, FilePlus, FileArchive, RefreshCcw, User } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

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
  const [showActivity, setShowActivity] = useState(false);

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

  const { data: submissions = [] } = useQuery({
    queryKey: ["re-audit-submissions-activity", auditId],
    queryFn: async () => {
      const { data } = await supabase
        .from("re_audit_submissions")
        .select("id, submitted_at, submitted_by_role, replaced_pdf, replaced_zip, submission_comment, submitter:profiles!submitted_by(full_name)")
        .eq("audit_id", auditId)
        .order("submitted_at", { ascending: false });
      return data || [];
    },
    enabled: !!auditId,
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["audit-activity-log", auditId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_activity_log")
        .select("id, action_type, description, entity_label, created_at, user_id, metadata, user_role")
        .eq("entity_type", "audit")
        .eq("entity_id", auditId)
        .order("created_at", { ascending: false })
        .limit(50);
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

  // Activity events: union of re_audit_submissions + user_activity_log
  const events: Array<{ id: string; at: string; icon: any; label: string; detail?: string; actor?: string }> = [];
  for (const s of submissions) {
    const actor = (s.submitter as any)?.full_name || s.submitted_by_role || "User";
    if (s.replaced_pdf) events.push({ id: `${s.id}-pdf`, at: s.submitted_at, icon: FilePlus, label: "PDF replaced", actor, detail: s.submission_comment || undefined });
    if (s.replaced_zip) events.push({ id: `${s.id}-zip`, at: s.submitted_at, icon: FileArchive, label: "Metadata ZIP replaced", actor, detail: s.submission_comment || undefined });
    if (!s.replaced_pdf && !s.replaced_zip) events.push({ id: `${s.id}-nc`, at: s.submitted_at, icon: RefreshCcw, label: "Sent back for re-audit without changes", actor, detail: s.submission_comment || undefined });
  }
  for (const a of activity as any[]) {
    // de-dup with submission rows by skipping the corresponding audit_failed/passed entries when very close in time
    const at = a.created_at as string;
    events.push({
      id: `act-${a.id}`,
      at,
      icon: Activity,
      label: (a.action_type as string).replace(/_/g, " "),
      detail: a.description || undefined,
      actor: undefined,
    });
  }
  events.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());

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

            {/* Activity since re-audit */}
            <div className="border-t pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setShowActivity(s => !s)}
              >
                <Activity className="h-4 w-4" />
                {showActivity ? "Hide activity" : `Show activity${events.length ? ` (${events.length})` : ""}`}
                <ChevronDown className={`h-4 w-4 transition-transform ${showActivity ? "" : "-rotate-90"}`} />
              </Button>
              {showActivity && (
                <div className="mt-3 max-h-[260px] overflow-y-auto space-y-3">
                  {events.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
                  ) : (
                    events.map(e => {
                      const Icon = e.icon;
                      return (
                        <div key={e.id} className="flex gap-3 text-sm">
                          <div className="mt-0.5"><Icon className="h-4 w-4 text-muted-foreground" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium capitalize">{e.label}</span>
                              {e.actor && (
                                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                  <User className="h-3 w-3" /> {e.actor}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground" title={format(new Date(e.at), "PPP p")}>
                                {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                              </span>
                            </div>
                            {e.detail && (
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">{e.detail}</p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};