import { useState, useEffect } from "react";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUploadLockStatus } from "@/hooks/useUploadLockStatus";
import { uploadInterviewFile, detectKind, UploadMode, UploadOutcome } from "@/lib/uploadInterviewFile";

interface Row {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "failed";
  outcome?: UploadOutcome;
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

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setRows(prev => [
      ...prev,
      ...files.map(f => ({ id: `${f.name}-${Date.now()}-${Math.random()}`, file: f, status: "pending" as const })),
    ]);
    e.target.value = "";
  };

  const remove = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const start = async () => {
    if (!user) return;
    if (rows.length === 0) return toast.error("Pick at least one file");
    if (mode === "new" && lock.locked) return toast.error(`Uploads locked: ${lock.reason}`);
    setRunning(true);
    setCompleted(0);
    let done = 0;
    for (const r of rows) {
      if (r.status === "done") { done++; continue; }
      setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: "uploading" } : x));
      const outcome = await uploadInterviewFile({ file: r.file, mode, userId: user.id });
      setRows(prev => prev.map(x => x.id === r.id ? {
        ...x,
        status: outcome.status === "success" ? "done" : "failed",
        outcome,
      } : x));
      done++;
      setCompleted(done);
    }
    setRunning(false);
    toast.success("Upload run finished");
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
                <Label className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${mode === "new" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="new" />
                  <div>
                    <div className="font-medium">New interview</div>
                    <div className="text-xs text-muted-foreground">First time uploading this PDF or metadata.</div>
                  </div>
                </Label>
                <Label className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${mode === "re_audit" ? "border-primary bg-primary/5" : ""}`}>
                  <RadioGroupItem value="re_audit" />
                  <div>
                    <div className="font-medium flex items-center gap-2">Re-audit <Repeat className="h-3.5 w-3.5" /></div>
                    <div className="text-xs text-muted-foreground">Replace files for an interview that already failed.</div>
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
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{rows.length} file(s) ready</div>
                    {running && <div className="text-xs text-muted-foreground">{completed}/{rows.length}</div>}
                  </div>
                  {running && <Progress value={totalProgress} className="h-2" />}
                  <ul className="divide-y rounded-md border">
                    {rows.map(r => {
                      const kind = detectKind(r.file);
                      return (
                        <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
                          {kind === "pdf" ? <FileText className="h-4 w-4 text-rose-500" /> : <Archive className="h-4 w-4 text-blue-500" />}
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{r.file.name}</div>
                            {r.outcome?.message && (
                              <div className={`text-xs ${r.outcome.status === "success" ? "text-emerald-600" : "text-red-600"}`}>
                                {r.outcome.message}
                              </div>
                            )}
                          </div>
                          {r.status === "uploading" && <span className="text-xs text-muted-foreground">Uploading…</span>}
                          {r.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                          {r.status === "failed" && <AlertTriangle className="h-4 w-4 text-red-500" />}
                          {!running && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(r.id)}><X className="h-4 w-4" /></Button>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <Button onClick={start} disabled={running || rows.length === 0 || (mode === "new" && lock.locked)} className="w-full">
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
  const [rows, setRows] = useState<AttemptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [modeFilter, setModeFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    let q = supabase.from("upload_attempts").select("*").order("created_at", { ascending: false }).limit(500);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (modeFilter !== "all") q = q.eq("mode", modeFilter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as AttemptRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter, modeFilter]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Your upload history</CardTitle>
          <CardDescription>Every PDF and ZIP you uploaded — succeeded, failed, or skipped.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={modeFilter} onValueChange={setModeFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="re_audit">Re-audit</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
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
      </CardContent>
    </Card>
  );
};

export default UploadCenter;