import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CheckCircle,
  XCircle,
  Zap,
  ChevronDown,
  Loader2,
  FileText,
  Smartphone,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  auditId: string;
  fileName: string;
  onCompleted?: (result: "passed" | "failed") => void;
}

export const QuickReAuditDecisionCard = ({ auditId, fileName, onCompleted }: Props) => {
  const qc = useQueryClient();
  const [showSameFail, setShowSameFail] = useState(false);
  const [showNewFail, setShowNewFail] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New-fail form state
  const [comment, setComment] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [artifacts, setArtifacts] = useState<string[]>([]);

  // Previous feedback (most recent cycle)
  const { data: lastFeedback } = useQuery({
    queryKey: ["quick-reaudit-last-feedback", auditId],
    queryFn: async () => {
      const { data } = await supabase
        .from("review_feedback_history")
        .select("cycle_number, review_comment, action_plan, artifact_correction, reviewed_at, reviewed_by")
        .eq("audit_id", auditId)
        .order("cycle_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!auditId,
  });

  // Previous checklist (most recent reviewer's saved progress)
  const { data: prevChecklist } = useQuery({
    queryKey: ["quick-reaudit-prev-checklist", auditId],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_checklist_progress")
        .select("items, failure_comments, has_failures, reviewer_id, updated_at")
        .eq("audit_id", auditId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!auditId,
  });

  const toggleArtifact = (a: string, checked: boolean) => {
    setArtifacts(prev => (checked ? [...prev, a] : prev.filter(x => x !== a)));
  };

  const runFail = async (reuse: boolean) => {
    const payload = reuse
      ? {
          _audit_id: auditId,
          _review_comment: lastFeedback?.review_comment || "",
          _action_plan: lastFeedback?.action_plan || "",
          _artifact_correction: lastFeedback?.artifact_correction || [],
          _reused_previous: true,
        }
      : {
          _audit_id: auditId,
          _review_comment: comment,
          _action_plan: actionPlan,
          _artifact_correction: artifacts,
          _reused_previous: false,
        };
    if (!reuse) {
      if (!comment.trim() || comment.trim().length < 10) {
        toast.error("Please provide a failure reason (at least 10 characters).");
        return;
      }
      if (artifacts.length === 0) {
        toast.error("Select at least one artifact that needs correction.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("re_audit_quick_fail" as any, payload);
      if (error) throw error;
      toast.success("Re-audit marked as failed.");
      setShowSameFail(false);
      setShowNewFail(false);
      qc.invalidateQueries({ queryKey: ["audit", auditId] });
      qc.invalidateQueries({ queryKey: ["review-feedback-history", auditId] });
      qc.invalidateQueries({ queryKey: ["review-activity-log", auditId] });
      qc.invalidateQueries({ queryKey: ["status-counts"] });
      onCompleted?.("failed");
    } catch (e: any) {
      toast.error(e?.message || "Failed to mark re-audit as failed");
    } finally {
      setSubmitting(false);
    }
  };

  const runPass = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("re_audit_quick_pass" as any, { _audit_id: auditId });
      if (error) throw error;
      toast.success("Re-audit marked as passed.");
      setShowPass(false);
      qc.invalidateQueries({ queryKey: ["audit", auditId] });
      qc.invalidateQueries({ queryKey: ["review-activity-log", auditId] });
      qc.invalidateQueries({ queryKey: ["status-counts"] });
      onCompleted?.("passed");
    } catch (e: any) {
      toast.error(e?.message || "Failed to mark re-audit as passed");
    } finally {
      setSubmitting(false);
    }
  };

  const items: any[] = Array.isArray(prevChecklist?.items) ? (prevChecklist!.items as any[]) : [];

  return (
    <>
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            Quick re-audit decision
          </CardTitle>
          <CardDescription>
            Save time on re-audits. Review the previous checklist below, then quick-pass or quick-fail.
            If a new checklist item has failed, run the full checklist instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowSameFail(true)}
              disabled={!lastFeedback}
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Fail — same reasons as last cycle
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowNewFail(true)}>
              <XCircle className="h-4 w-4 mr-1.5" />
              Fail — new reasons
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setShowPass(true)}
            >
              <CheckCircle className="h-4 w-4 mr-1.5" />
              Pass — issues fixed
            </Button>
          </div>

          <Collapsible open={showChecklist} onOpenChange={setShowChecklist}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 -ml-2">
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showChecklist ? "" : "-rotate-90"}`}
                />
                Previous checklist answers {items.length > 0 && <Badge variant="outline">{items.length} items</Badge>}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2">
                  No previous checklist progress saved for this interview.
                </p>
              ) : (
                <div className="mt-2 rounded-md border max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Question</TableHead>
                        <TableHead className="w-24">Answer</TableHead>
                        <TableHead>Comment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((it: any, i: number) => {
                        const pass = it.passed === true || it.answer === "pass" || it.status === "pass";
                        const fail = it.passed === false || it.answer === "fail" || it.status === "fail";
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-xs">Q{i}</TableCell>
                            <TableCell className="text-xs">{it.question || it.label || it.text || `Item ${i}`}</TableCell>
                            <TableCell>
                              {pass ? (
                                <Badge className="bg-emerald-600 text-white">Pass</Badge>
                              ) : fail ? (
                                <Badge variant="destructive">Fail</Badge>
                              ) : (
                                <Badge variant="outline">—</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-pre-wrap">
                              {it.comment || it.failureComment || it.note || ""}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md bg-muted/40 px-3 py-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500" />
            <p>
              These quick actions still go through the standard audit pipeline, so the FM and the
              activity timeline will reflect the result, who decided, and when.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Confirm: fail with same reasons */}
      <AlertDialog open={showSameFail} onOpenChange={setShowSameFail}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Fail re-audit with the previous feedback?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2">
                <div>
                  <Label className="text-xs">Reason for failure</Label>
                  <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/40 p-2 mt-1">
                    {lastFeedback?.review_comment || "—"}
                  </p>
                </div>
                {lastFeedback?.action_plan && (
                  <div>
                    <Label className="text-xs">Action plan</Label>
                    <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/40 p-2 mt-1">
                      {lastFeedback.action_plan}
                    </p>
                  </div>
                )}
                {lastFeedback?.artifact_correction && lastFeedback.artifact_correction.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {lastFeedback.artifact_correction.map((a: string) => (
                      <Badge key={a} variant="outline" className="gap-1">
                        {a === "scanned_pdf" ? <FileText className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                        {a === "scanned_pdf" ? "Scanned PDF" : a === "mobile_metadata" ? "Mobile Metadata" : a}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => runFail(true)}
              disabled={submitting || !lastFeedback}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
              Confirm fail
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New-reasons fail dialog */}
      <Dialog open={showNewFail} onOpenChange={setShowNewFail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fail re-audit with new feedback</DialogTitle>
            <DialogDescription>
              Provide the new reason and pick which artifacts need correction.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for failure *</Label>
              <Textarea
                rows={4}
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Explain why this re-audit still fails…"
              />
            </div>
            <div className="space-y-2">
              <Label>Action plan (optional)</Label>
              <Textarea
                rows={3}
                value={actionPlan}
                onChange={e => setActionPlan(e.target.value)}
                placeholder="What should the FM do next?"
              />
            </div>
            <div className="space-y-2">
              <Label>Artifact correction *</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={artifacts.includes("scanned_pdf")}
                    onCheckedChange={c => toggleArtifact("scanned_pdf", !!c)}
                  />
                  <FileText className="h-4 w-4" /> Scanned PDF
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={artifacts.includes("mobile_metadata")}
                    onCheckedChange={c => toggleArtifact("mobile_metadata", !!c)}
                  />
                  <Smartphone className="h-4 w-4" /> Mobile Metadata
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFail(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => runFail(false)} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
              Submit fail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm pass */}
      <AlertDialog open={showPass} onOpenChange={setShowPass}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pass re-audit?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm that all previous issues for <span className="font-mono">{fileName}</span> have
              been fixed. The interview will be marked as Audit Passed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runPass}
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1.5" />}
              Confirm pass
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};