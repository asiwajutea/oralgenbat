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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle, XCircle, Zap, ChevronDown, Loader2, FileText, Smartphone, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  auditId: string;
  fileName: string;
  onCompleted?: (result: "passed" | "failed") => void;
}

export const QuickReAuditDecisionCard = ({ auditId, fileName, onCompleted }: Props) => {
  const qc = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [showSameFail, setShowSameFail] = useState(false);
  const [showNewFail, setShowNewFail] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showChecklist, setShowChecklist] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // New-fail form state
  const [comment, setComment] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [artifacts, setArtifacts] = useState<string[]>([]);

  // Same-reason editable state (prefilled from last cycle)
  const [sameComment, setSameComment] = useState("");
  const [sameActionPlan, setSameActionPlan] = useState("");
  const [sameArtifacts, setSameArtifacts] = useState<string[]>([]);

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
    setArtifacts((prev) => (checked ? [...prev, a] : prev.filter((x) => x !== a)));
  };
  const toggleSameArtifact = (a: string, checked: boolean) => {
    setSameArtifacts((prev) => (checked ? [...prev, a] : prev.filter((x) => x !== a)));
  };

  // Prefill same-reason fields whenever the dialog opens or last feedback changes
  const openSameFail = () => {
    setSameComment(lastFeedback?.review_comment || "");
    setSameActionPlan(lastFeedback?.action_plan || "");
    setSameArtifacts(lastFeedback?.artifact_correction || []);
    setShowSameFail(true);
  };

  const runFail = async (reuse: boolean) => {
    const effComment = reuse ? sameComment : comment;
    const effActionPlan = reuse ? sameActionPlan : actionPlan;
    const effArtifacts = reuse ? sameArtifacts : artifacts;

    if (!effComment.trim() || effComment.trim().length < 10) {
      toast.error("Please provide a failure reason (at least 10 characters).");
      return;
    }
    if (effArtifacts.length === 0) {
      toast.error("Select at least one artifact that needs correction.");
      return;
    }

    // Decide if the auditor actually kept the previous feedback verbatim
    const unchanged =
      reuse &&
      effComment.trim() === (lastFeedback?.review_comment || "").trim() &&
      effActionPlan.trim() === (lastFeedback?.action_plan || "").trim() &&
      JSON.stringify([...effArtifacts].sort()) ===
        JSON.stringify([...(lastFeedback?.artifact_correction || [])].sort());

    const payload = {
      _audit_id: auditId,
      _review_comment: effComment,
      _action_plan: effActionPlan,
      _artifact_correction: effArtifacts,
      _reused_previous: unchanged,
    };
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("re_audit_quick_fail" as any, payload);
      if (error) throw error;
      toast.success("Re-audit marked as failed.");
      setShowSameFail(false);
      setShowNewFail(false);
      setIsOpen(false);
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
      setIsOpen(false);
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
  const itemsHasAnswers = items.some(
    (it: any) => it?.answer === "yes" || it?.answer === "no" || it?.passed === true || it?.passed === false,
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Quick Re-Audit Decision
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl p-0 border-none bg-transparent shadow-none">
        <Card className="border-primary/40 bg-background w-full">
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-primary" />
              Quick re-audit decision
            </CardTitle>
            <CardDescription>
              Save time on re-audits. Review the previous checklist below, then quick-pass or quick-fail. If a new
              checklist item has failed, run the full checklist instead.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="destructive" onClick={openSameFail} disabled={!lastFeedback}>
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
                  <ChevronDown className={`h-4 w-4 transition-transform ${showChecklist ? "" : "-rotate-90"}`} />
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
                          const pass =
                            it.passed === true ||
                            it.answer === "yes" ||
                            it.answer === "pass" ||
                            it.status === "pass";
                          const fail =
                            it.passed === false ||
                            it.answer === "no" ||
                            it.answer === "fail" ||
                            it.status === "fail";
                          return (
                            <TableRow key={i}>
                              <TableCell className="text-xs">Q{typeof it.id === "number" ? it.id : i}</TableCell>
                              <TableCell className="text-xs">
                                {it.question || it.label || it.text || `Item ${i}`}
                              </TableCell>
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
                These quick actions still go through the standard audit pipeline, so the FM and the activity timeline
                will reflect the result, who decided, and when.
              </p>
            </div>
          </CardContent>
        </Card>
      </DialogContent>

      {/* Fail with same reasons — editable so the auditor can refine wording */}
      <Dialog open={showSameFail} onOpenChange={setShowSameFail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fail re-audit using the previous feedback</DialogTitle>
            <DialogDescription>
              Pre-filled from the last cycle — edit the wording if you want to explain more.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for failure *</Label>
              <Textarea rows={4} value={sameComment} onChange={(e) => setSameComment(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Action plan (optional)</Label>
              <Textarea rows={3} value={sameActionPlan} onChange={(e) => setSameActionPlan(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Artifact correction *</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={sameArtifacts.includes("scanned_pdf")}
                    onCheckedChange={(c) => toggleSameArtifact("scanned_pdf", !!c)}
                  />
                  <FileText className="h-4 w-4" /> Scanned PDF
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={sameArtifacts.includes("mobile_metadata")}
                    onCheckedChange={(c) => toggleSameArtifact("mobile_metadata", !!c)}
                  />
                  <Smartphone className="h-4 w-4" /> Mobile Metadata
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSameFail(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => runFail(true)} disabled={submitting || !lastFeedback}>
              {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
              Confirm fail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New-reasons fail dialog */}
      <Dialog open={showNewFail} onOpenChange={setShowNewFail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fail re-audit with new feedback</DialogTitle>
            <DialogDescription>Provide the new reason and pick which artifacts need correction.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for failure *</Label>
              <Textarea
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Explain why this re-audit still fails…"
              />
            </div>
            <div className="space-y-2">
              <Label>Action plan (optional)</Label>
              <Textarea
                rows={3}
                value={actionPlan}
                onChange={(e) => setActionPlan(e.target.value)}
                placeholder="What should the FM do next?"
              />
            </div>
            <div className="space-y-2">
              <Label>Artifact correction *</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={artifacts.includes("scanned_pdf")}
                    onCheckedChange={(c) => toggleArtifact("scanned_pdf", !!c)}
                  />
                  <FileText className="h-4 w-4" /> Scanned PDF
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={artifacts.includes("mobile_metadata")}
                    onCheckedChange={(c) => toggleArtifact("mobile_metadata", !!c)}
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
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-1.5" />
              )}
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
              Confirm that all previous issues for <span className="font-mono">{fileName}</span> have been fixed. The
              interview will be marked as Audit Passed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runPass}
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-1.5" />
              )}
              Confirm pass
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
