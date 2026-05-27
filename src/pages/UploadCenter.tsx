import { useState, useEffect, useRef } from "react";
import { Upload, FileText, Archive, X, CheckCircle2, AlertTriangle, Lock, Repeat, History, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUploadLockStatus } from "@/hooks/useUploadLockStatus";
import { uploadInterviewFile, detectKind, UploadMode, UploadOutcome } from "@/lib/uploadInterviewFile";
import { useIsMobile } from "@/hooks/use-mobile";

interface Row {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "failed";
  progress: number;
  outcome?: UploadOutcome;
  existingStatus?: string | null; // status of matching audit (for badge labelling)
  existingHasMetadata?: boolean | null;
  hasPairedPdfInBatch?: boolean;
  willSkipReason?: string | null;
  lookupDone?: boolean;
}

interface AttemptRow {
  id: string;
  file_name: string;
  detected_kind: string;
  mode: string;
  status: string;
  message: string | null;
  audit_id: string | null;
  created_at: string;
}

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    failed: "bg-red-500/15 text-red-700 dark:text-red-400",
    duplicate: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    locked: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    quota_blocked: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  };
  return map[s] || "bg-muted text-muted-foreground";
};

const UploadCenter = () => {
  const { user } = useAuth();
  const lock = useUploadLockStatus();
  const [mode, setMode] = useState<UploadMode>("new");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [summary, setSummary] = useState<{ ok: number; failed: number; duplicate: number; blocked: number } | null>(null);
  const rowsRef = useRef<Row[]>([]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [showPreflight, setShowPreflight] = useState(false);

  // If "new" uploads are locked, default the mode to re-audit
  useEffect(() => {
    if (lock.locked && mode === "new") setMode("re_audit");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lock.locked]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newRows: Row[] = files.map(f => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      file: f,
      status: "pending" as const,
      progress: 0,
      lookupDone: false,
    }));
    setRows(prev => [...prev, ...newRows]);
    e.target.value = "";
    setSummary(null);
    setSummaryText(null);

    // Batch-fetch matching audits to label rows correctly (Re-audit vs Replace)
    const baseNames = Array.from(new Set(newRows.map(r => r.file.name.replace(/\.(pdf|zip)$/i, ""))));
    if (baseNames.length === 0) return;
    const { data } = await supabase
      .from("audits")
      .select("file_name, status, mobile_zip_url")
      .in("file_name", baseNames);
    const infoByName = new Map<string, { status: string; hasMetadata: boolean }>();
    (data || []).forEach((a: any) =>
      infoByName.set(a.file_name, { status: a.status, hasMetadata: !!a.mobile_zip_url }),
    );
    setRows(prev => {
      // Build a set of PDF base names across the WHOLE current queue (including pre-existing rows)
      const pdfBaseNamesInBatch = new Set(
        prev
          .filter(r => detectKind(r.file) === "pdf")
          .map(r => r.file.name.replace(/\.(pdf|zip)$/i, "")),
      );
      return prev.map(r => {
        if (!newRows.find(n => n.id === r.id) && r.lookupDone) {
          // re-evaluate pairing for existing rows since the batch composition may have changed
          const base = r.file.name.replace(/\.(pdf|zip)$/i, "");
          const kind = detectKind(r.file);
          const info = infoByName.get(base) ?? null;
          const existingStatus = r.existingStatus ?? info?.status ?? null;
          const existingHasMetadata = r.existingHasMetadata ?? info?.hasMetadata ?? null;
          const hasPairedPdfInBatch = kind === "metadata_zip" ? pdfBaseNamesInBatch.has(base) : true;
          let willSkipReason: string | null = null;
          if (mode === "new" && kind === "metadata_zip" && !hasPairedPdfInBatch && !existingStatus) {
            willSkipReason = "No paired PDF — upload the PDF first";
          }
          return { ...r, hasPairedPdfInBatch, willSkipReason };
        }
        const base = r.file.name.replace(/\.(pdf|zip)$/i, "");
        const kind = detectKind(r.file);
        const info = infoByName.get(base) ?? null;
        const hasPairedPdfInBatch = kind === "metadata_zip" ? pdfBaseNamesInBatch.has(base) : true;
        let willSkipReason: string | null = null;
        if (mode === "new" && kind === "metadata_zip" && !hasPairedPdfInBatch && !info) {
          willSkipReason = "No paired PDF — upload the PDF first";
        }
        return {
          ...r,
          existingStatus: info?.status ?? null,
          existingHasMetadata: info?.hasMetadata ?? null,
          hasPairedPdfInBatch,
          willSkipReason,
          lookupDone: true,
        };
      });
    });
  };

  const remove = (id: string) => setRows(prev => prev.filter(r => r.id !== id || r.status !== "pending"));

  // Group rows by base name so a PDF + its matching ZIP show as a single "paired" entry.
  type Group = {
    baseName: string;
    pdf?: Row;
    zip?: Row;
    /** computed per-mode label */
    label: { text: string; cls: string };
    /** true if BOTH files in the group will be skipped before upload */
    willSkip: boolean;
    skipReason?: string;
    /** which files contribute to the "to upload" count */
    uploadCount: number;
  };
  const groups: Group[] = (() => {
    const map = new Map<string, Group>();
    for (const r of rows) {
      const base = r.file.name.replace(/\.(pdf|zip)$/i, "");
      const kind = detectKind(r.file);
      let g = map.get(base);
      if (!g) {
        g = { baseName: base, label: { text: "", cls: "" }, willSkip: false, uploadCount: 0 };
        map.set(base, g);
      }
      if (kind === "pdf") g.pdf = r;
      else if (kind === "metadata_zip") g.zip = r;
    }
    // Decide label per group
    for (const g of map.values()) {
      const sample = g.pdf ?? g.zip!;
      const existingStatus = sample.existingStatus ?? null;
      const existingHasMetadata = sample.existingHasMetadata ?? null;
      if (mode === "new") {
        if (g.pdf && g.zip) {
          if (existingStatus) {
            g.label = { text: "Already uploaded — will skip", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
            g.willSkip = true;
            g.skipReason = "An audit with this file name already exists.";
          } else {
            g.label = { text: "Paired (PDF + Metadata)", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" };
            g.uploadCount = 2;
          }
        } else if (g.pdf && !g.zip) {
          if (existingStatus) {
            g.label = { text: "Already uploaded — will skip", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
            g.willSkip = true;
            g.skipReason = "An audit with this file name already exists.";
          } else {
            g.label = { text: "PDF only", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" };
            g.uploadCount = 1;
          }
        } else if (!g.pdf && g.zip) {
          if (!existingStatus) {
            g.label = { text: "Will skip — no matching PDF", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
            g.willSkip = true;
            g.skipReason = "No paired PDF in this batch or in the system.";
          } else if (existingHasMetadata) {
            g.label = { text: "Duplicate metadata — will skip", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
            g.willSkip = true;
            g.skipReason = "Metadata is already attached to this interview.";
          } else {
            g.label = { text: "Pair with existing PDF", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" };
            g.uploadCount = 1;
          }
        }
      } else {
        // re-audit mode: each file is independent (replace)
        const isFailed = existingStatus === "Failed";
        g.label = !sample.lookupDone
          ? { text: "Checking…", cls: "bg-muted text-muted-foreground" }
          : isFailed
            ? { text: "Re-audit replacement", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" }
            : { text: "Replace files", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" };
        g.uploadCount = (g.pdf ? 1 : 0) + (g.zip ? 1 : 0);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.baseName.localeCompare(b.baseName));
  })();

  const preflightStats = (() => {
    let paired = 0, pdfOnly = 0, zipPaired = 0, skip = 0;
    for (const g of groups) {
      if (g.willSkip) { skip++; continue; }
      if (mode === "new") {
        if (g.pdf && g.zip) paired++;
        else if (g.pdf) pdfOnly++;
        else if (g.zip) zipPaired++;
      } else {
        // re-audit
        if (g.pdf && g.zip) paired++;
        else if (g.pdf) pdfOnly++;
        else zipPaired++;
      }
    }
    return { paired, pdfOnly, zipPaired, skip, total: groups.length };
  })();

  const start = async () => {
    if (!user) return;
    if (rows.length === 0) return toast.error("Pick at least one file");
    if (mode === "new" && lock.locked) return toast.error(`Uploads locked: ${lock.reason}`);
    // Open the preflight summary first
    setShowPreflight(true);
  };

  const runUpload = async () => {
    if (!user) return;
    setShowPreflight(false);
    setRunning(true);
    setCompleted(0);
    setSummary(null);
    setSummaryText(null);

    const outcomes = new Map<string, UploadOutcome>();
    let done = 0;
    const totalFiles = rows.filter(r => r.status !== "done").length;

    const markSkip = (row: Row, reason: string) => {
      const outcome: UploadOutcome = { status: "failed", message: reason };
      outcomes.set(row.id, outcome);
      setRows(prev => prev.map(x => x.id === row.id ? { ...x, status: "failed", progress: 100, outcome } : x));
      done++;
      setCompleted(done);
    };

    const runOne = async (row: Row): Promise<UploadOutcome> => {
      setRows(prev => prev.map(x => x.id === row.id && x.status === "pending" ? { ...x, status: "uploading", progress: 0 } : x));
      const outcome = await uploadInterviewFile({
        file: row.file,
        mode,
        userId: user.id,
        onProgress: (pct) => setRows(prev => prev.map(x => x.id === row.id ? { ...x, progress: pct } : x)),
      });
      outcomes.set(row.id, outcome);
      setRows(prev => prev.map(x => x.id === row.id ? {
        ...x,
        status: outcome.status === "success" ? "done" : "failed",
        progress: 100,
        outcome,
      } : x));
      done++;
      setCompleted(done);
      return outcome;
    };

    // Process groups sequentially. Within each group: PDF first, then ZIP.
    for (const g of groups) {
      if (g.willSkip) {
        if (g.pdf) markSkip(g.pdf, g.skipReason || "Skipped");
        if (g.zip) markSkip(g.zip, g.skipReason || "Skipped");
        continue;
      }
      let pdfOk = true;
      if (g.pdf) {
        const out = await runOne(g.pdf);
        pdfOk = out.status === "success";
      }
      if (g.zip) {
        if (g.pdf && !pdfOk) {
          markSkip(g.zip, "Skipped — paired PDF failed to upload");
        } else {
          await runOne(g.zip);
        }
      }
    }

    setRunning(false);
    // Compute summary from the local outcomes map (avoids React commit timing issues)
    const rowById = new Map(rowsRef.current.map(r => [r.id, r]));
    let ok = 0, failed = 0, duplicate = 0, blocked = 0;
    let reaudit = 0, replace = 0;
    outcomes.forEach((o, id) => {
      if (o.status === "success") {
        ok++;
        if (mode === "re_audit") {
          const row = rowById.get(id);
          if (row?.existingStatus === "Failed") reaudit++;
          else replace++;
        }
      } else if (o.status === "failed") failed++;
      else if (o.status === "duplicate") duplicate++;
      else if (o.status === "locked" || o.status === "quota_blocked") blocked++;
    });
    setSummary({ ok, failed, duplicate, blocked });

    let text = `${ok} uploaded successfully.`;
    if (mode === "re_audit" && ok > 0) {
      const splits = [
        replace > 0 && `${replace} replace`,
        reaudit > 0 && `${reaudit} re-audit`,
      ].filter(Boolean).join(", ");
      if (splits) text += ` ${splits}.`;
    }
    if (failed > 0) text += ` ${failed} failed.`;
    if (duplicate > 0) text += ` ${duplicate} duplicate.`;
    if (blocked > 0) text += ` ${blocked} blocked.`;
    setSummaryText(text);
    if (failed > 0 && ok === 0) toast.error(text);
    else toast.success(text);
    void totalFiles;
  };

  const totalProgress = rows.length === 0 ? 0 : Math.round((completed / rows.length) * 100);

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Upload Center</h1>
        <p className="text-sm text-muted-foreground">One place to upload interview PDFs and metadata, for new audits or re-audits.</p>
      </header>

      {lock.locked && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <Lock className="h-4 w-4 mt-0.5 text-amber-600" />
          <div>
            <div className="font-medium text-amber-700 dark:text-amber-300">New interview uploads are locked</div>
            <div className="text-xs text-amber-700/80 dark:text-amber-300/80">{lock.reason}</div>
          </div>
        </div>
      )}

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-2" />Upload</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-2" />History</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 1 — What are you uploading?</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={mode} onValueChange={v => setMode(v as UploadMode)} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Label
                  className={`flex items-start gap-3 rounded-md border p-3 ${
                    lock.locked
                      ? "opacity-50 cursor-not-allowed bg-muted/40"
                      : "cursor-pointer"
                  } ${mode === "new" ? "border-primary bg-primary/5" : ""}`}
                  aria-disabled={lock.locked}
                >
                  <RadioGroupItem value="new" disabled={lock.locked} />
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      New interview
                      {lock.locked && <Lock className="h-3.5 w-3.5 text-amber-600" />}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {lock.locked
                        ? "New uploads are currently locked by an administrator."
                        : "First time uploading this PDF or metadata."}
                    </div>
                  </div>
                </Label>
                <Label className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${mode === "re_audit" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="re_audit" />
                  <div>
                    <div className="font-medium flex items-center gap-2">Replace files (re-audit) <Repeat className="h-3.5 w-3.5" /></div>
                    <div className="text-xs text-muted-foreground">Upload a corrected PDF or metadata for an existing interview, whether or not it failed.</div>
                  </div>
                </Label>
              </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Step 2 — Drop your files</CardTitle>
              <CardDescription>PDFs and metadata ZIPs are auto-detected. Use the proper folder name (NGXX_XXXX_XXXXXXXX_XXXX).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label htmlFor="upc-files" className="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30">
                <input id="upc-files" type="file" multiple accept=".pdf,.zip" onChange={onPick} className="hidden" />
                <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                <div className="mt-2 text-sm text-muted-foreground">Click to choose PDF and/or ZIP files</div>
              </label>

              {rows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-medium">{rows.length} file(s) ready</div>
                    {running && <div className="text-xs text-muted-foreground">{completed}/{rows.length}</div>}
                  </div>
                  {running && <Progress value={totalProgress} className="h-2" />}
                  {summary && !running && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="font-medium">Upload summary</div>
                        <div className="text-xs text-muted-foreground">{summaryText}</div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSummary(null)} aria-label="Dismiss summary">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <ul className="divide-y rounded-md border max-h-[55vh] sm:max-h-[420px] overflow-y-auto">
                    {groups.map(g => {
                      const childRows = [g.pdf, g.zip].filter(Boolean) as Row[];
                      const anyUploading = childRows.some(r => r.status === "uploading");
                      const avgProgress = childRows.length
                        ? Math.round(childRows.reduce((s, r) => s + (r.progress || 0), 0) / childRows.length)
                        : 0;
                      const allDone = childRows.every(r => r.status === "done");
                      const anyFailed = childRows.some(r => r.status === "failed");
                      const removable = childRows.every(r => r.status === "pending");
                      return (
                        <li key={g.baseName} className="p-2 sm:p-3 text-sm space-y-1.5">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="flex items-center gap-1 shrink-0">
                              {g.pdf && <FileText className="h-4 w-4 text-rose-500" />}
                              {g.zip && <Archive className="h-4 w-4 text-blue-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                <span className="truncate font-mono text-xs sm:text-sm">{g.baseName}</span>
                                <Badge variant="secondary" className={`${g.label.cls} text-[10px] px-1.5 py-0`}>{g.label.text}</Badge>
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {childRows.map(r => detectKind(r.file) === "pdf" ? "PDF" : "ZIP").join(" + ")}
                                {g.skipReason && <span className="text-amber-700 dark:text-amber-400"> · {g.skipReason}</span>}
                              </div>
                              {anyUploading && <Progress value={avgProgress} className="h-1 mt-1" />}
                              {childRows.map(r => r.outcome?.message && (
                                <div key={r.id} className={`text-[11px] ${r.outcome.status === "success" ? "text-emerald-600" : "text-red-600"}`}>
                                  {detectKind(r.file) === "pdf" ? "PDF" : "ZIP"}: {r.outcome.message}
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {anyUploading && (
                                <span className="text-[11px] tabular-nums text-muted-foreground w-10 text-right">{avgProgress}%</span>
                              )}
                              {!anyUploading && allDone && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                              {!anyUploading && !allDone && anyFailed && <AlertTriangle className="h-4 w-4 text-red-500" />}
                              {removable && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                  childRows.forEach(r => remove(r.id));
                                }} aria-label="Remove">
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <Button onClick={start} disabled={running || rows.length === 0 || (mode === "new" && lock.locked)} className="w-full sm:w-auto sm:min-w-[160px] h-11">
                {running ? "Uploading…" : "Start upload"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <UploadHistoryTable />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const UploadHistoryTable = () => {
  const isMobile = useIsMobile();
  const { user, userRole } = useAuth();
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const [rows, setRows] = useState<AttemptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("self");
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 25;

  // Load distinct uploaders for admin filter
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name", { ascending: true })
        .limit(500);
      setUsers((data || []).map((p: any) => ({ id: p.id, name: p.full_name || p.email || p.id.slice(0, 8) })));
    })();
  }, [isAdmin]);

  const load = async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase
      .from("upload_attempts")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    // Scope: non-admins always see only their own; admins can pick.
    if (!isAdmin) {
      if (user?.id) q = q.eq("user_id", user.id);
    } else if (userFilter !== "all") {
      const target = userFilter === "self" ? user?.id : userFilter;
      if (target) q = q.eq("user_id", target);
    }
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (modeFilter !== "all") q = q.eq("mode", modeFilter);
    const { data, error, count } = await q;
    if (error) toast.error(error.message);
    setRows((data as AttemptRow[]) || []);
    setTotal(count || 0);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter, modeFilter, userFilter, page]);
  useEffect(() => { setPage(0); }, [statusFilter, modeFilter, userFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="text-base">Your upload history</CardTitle>
          <CardDescription>
            {isAdmin ? "Upload attempts across all users." : "Every PDF and ZIP you uploaded — succeeded, failed, or skipped."}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="User" /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="self">Just me</SelectItem>
                <SelectItem value="all">All users</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={modeFilter} onValueChange={setModeFilter}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="re_audit">Re-audit</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="duplicate">Duplicate</SelectItem>
              <SelectItem value="locked">Locked</SelectItem>
              <SelectItem value="quota_blocked">Quota blocked</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
      </CardHeader>
      <CardContent>
        {isMobile ? (
          <ul className="space-y-2">
            {rows.length === 0 ? (
              <li className="text-center text-sm text-muted-foreground py-6 border rounded-md">No uploads yet.</li>
            ) : rows.map(r => (
              <li key={r.id} className="border rounded-md p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-xs truncate flex-1">{r.file_name}</div>
                  <Badge variant="secondary" className={statusBadge(r.status)}>{r.status}</Badge>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{r.detected_kind === "pdf" ? "PDF" : r.detected_kind === "metadata_zip" ? "ZIP" : "?"} · {r.mode === "new" ? "New" : "Re-audit"}</span>
                  <span>{format(new Date(r.created_at), "MMM d, HH:mm")}</span>
                </div>
                {r.message && <div className="text-xs text-muted-foreground break-words">{r.message}</div>}
              </li>
            ))}
          </ul>
        ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No uploads yet.</TableCell></TableRow>
              ) : rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{format(new Date(r.created_at), "MMM d, HH:mm")}</TableCell>
                  <TableCell className="font-mono text-xs">{r.file_name}</TableCell>
                  <TableCell className="text-xs">{r.detected_kind === "pdf" ? "PDF" : r.detected_kind === "metadata_zip" ? "ZIP" : "?"}</TableCell>
                  <TableCell className="text-xs">{r.mode === "new" ? "New" : "Re-audit"}</TableCell>
                  <TableCell><Badge variant="secondary" className={statusBadge(r.status)}>{r.status}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[400px] truncate" title={r.message || ""}>{r.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
          <div>
            {total === 0 ? "0 results" : `Showing ${page * PAGE_SIZE + 1}-${Math.min((page + 1) * PAGE_SIZE, total)} of ${total}`}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>Prev</Button>
            <span className="px-2">Page {page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default UploadCenter;