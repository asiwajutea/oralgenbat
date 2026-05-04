import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Lock, Unlock, Loader2, Plus, Trash2 } from "lucide-react";

type LockRow = {
  scope_type: "global" | "contractor" | "field_manager" | "interviewer";
  scope_id: string;
  locked: boolean;
  reason: string | null;
  updated_at: string;
};

type QuotaRow = {
  scope_type: "field_manager" | "interviewer";
  scope_id: string;
  metric: "interviews" | "names";
  limit_value: number;
  reset_at: string | null;
  reset_period: "one_off" | "weekly" | "monthly";
  updated_at: string;
};

const UploadControls = () => {
  const { userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [locks, setLocks] = useState<LockRow[]>([]);
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [globalLock, setGlobalLock] = useState<LockRow | null>(null);
  const [globalReason, setGlobalReason] = useState("");

  // New lock inputs
  const [newLockType, setNewLockType] = useState<LockRow["scope_type"]>("interviewer");
  const [newLockId, setNewLockId] = useState("");
  const [newLockReason, setNewLockReason] = useState("");

  // New quota inputs
  const [newQType, setNewQType] = useState<QuotaRow["scope_type"]>("interviewer");
  const [newQId, setNewQId] = useState("");
  const [newQMetric, setNewQMetric] = useState<QuotaRow["metric"]>("interviews");
  const [newQLimit, setNewQLimit] = useState<number>(50);
  const [newQResetAt, setNewQResetAt] = useState("");
  const [newQPeriod, setNewQPeriod] = useState<QuotaRow["reset_period"]>("monthly");

  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const isContractorScoped = userRole === "contractor" || userRole === "sub_contractor";

  const load = async () => {
    setLoading(true);
    const [{ data: lockData }, { data: quotaData }] = await Promise.all([
      supabase.from("upload_lock_settings").select("*").order("scope_type"),
      supabase.from("upload_quota_settings").select("*").order("scope_type"),
    ]);
    const all = (lockData || []) as LockRow[];
    const g = all.find((l) => l.scope_type === "global") || null;
    setGlobalLock(g);
    setGlobalReason(g?.reason || "");
    setLocks(all.filter((l) => l.scope_type !== "global"));
    setQuotas((quotaData || []) as QuotaRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (!isAdmin && !isContractorScoped) return <Navigate to="/" replace />;

  const toggleGlobal = async (next: boolean) => {
    const payload: any = {
      scope_type: "global",
      scope_id: "",
      locked: next,
      reason: globalReason || null,
      set_by: (await supabase.auth.getUser()).data.user?.id,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("upload_lock_settings").upsert(payload, { onConflict: "scope_type,scope_id" });
    if (error) { toast.error(error.message); return; }
    toast.success(`Global uploads ${next ? "locked" : "unlocked"}`);
    load();
  };

  const addLock = async () => {
    if (!newLockId.trim() && newLockType !== "global") {
      toast.error("Scope ID is required");
      return;
    }
    const { error } = await supabase.from("upload_lock_settings").upsert({
      scope_type: newLockType,
      scope_id: newLockId.trim(),
      locked: true,
      reason: newLockReason || null,
      set_by: (await supabase.auth.getUser()).data.user?.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "scope_type,scope_id" });
    if (error) { toast.error(error.message); return; }
    toast.success("Lock added");
    setNewLockId(""); setNewLockReason("");
    load();
  };

  const removeLock = async (l: LockRow) => {
    const { error } = await supabase.from("upload_lock_settings")
      .delete()
      .eq("scope_type", l.scope_type)
      .eq("scope_id", l.scope_id);
    if (error) { toast.error(error.message); return; }
    toast.success("Lock removed");
    load();
  };

  const addQuota = async () => {
    if (!newQId.trim()) { toast.error("Scope ID is required"); return; }
    if (newQLimit <= 0) { toast.error("Limit must be > 0"); return; }
    const { error } = await supabase.from("upload_quota_settings").upsert({
      scope_type: newQType,
      scope_id: newQId.trim(),
      metric: newQMetric,
      limit_value: newQLimit,
      reset_at: newQResetAt ? new Date(newQResetAt).toISOString() : null,
      reset_period: newQPeriod,
      set_by: (await supabase.auth.getUser()).data.user?.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "scope_type,scope_id,metric" });
    if (error) { toast.error(error.message); return; }
    toast.success("Quota added");
    setNewQId(""); setNewQResetAt("");
    load();
  };

  const removeQuota = async (q: QuotaRow) => {
    const { error } = await supabase.from("upload_quota_settings")
      .delete()
      .eq("scope_type", q.scope_type)
      .eq("scope_id", q.scope_id)
      .eq("metric", q.metric);
    if (error) { toast.error(error.message); return; }
    load();
  };

  if (loading) {
    return <div className="container mx-auto p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Lock className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Upload Controls</h1>
      </div>

      <Tabs defaultValue="locks">
        <TabsList>
          <TabsTrigger value="locks">Locks</TabsTrigger>
          <TabsTrigger value="quotas">Quotas</TabsTrigger>
        </TabsList>

        <TabsContent value="locks" className="space-y-4">
          {isAdmin && (
            <Card>
              <CardHeader><CardTitle>Global lock</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={!!globalLock?.locked} onCheckedChange={toggleGlobal} />
                  <Label>{globalLock?.locked ? "All uploads are locked" : "All uploads allowed"}</Label>
                </div>
                <div>
                  <Label className="text-xs">Reason shown to users</Label>
                  <Input value={globalReason} onChange={(e) => setGlobalReason(e.target.value)}
                         placeholder="e.g. End of fieldwork window"
                         onBlur={() => globalLock?.locked && toggleGlobal(true)} />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Scoped locks</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_1fr_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs">Scope</Label>
                  <Select value={newLockType} onValueChange={(v) => setNewLockType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contractor">Contractor</SelectItem>
                      <SelectItem value="field_manager">Field Manager (UUID)</SelectItem>
                      <SelectItem value="interviewer">Interviewer code</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Scope ID</Label>
                  <Input value={newLockId} onChange={(e) => setNewLockId(e.target.value)}
                         placeholder={newLockType === "field_manager" ? "FM user UUID" : newLockType === "contractor" ? "Contractor ID" : "Interviewer code"} />
                </div>
                <div>
                  <Label className="text-xs">Reason</Label>
                  <Input value={newLockReason} onChange={(e) => setNewLockReason(e.target.value)} placeholder="Optional" />
                </div>
                <Button onClick={addLock} className="gap-1"><Plus className="h-4 w-4" />Add lock</Button>
              </div>

              <div className="border rounded-md divide-y">
                {locks.length === 0 && <p className="p-4 text-sm text-muted-foreground">No scoped locks.</p>}
                {locks.map((l) => (
                  <div key={`${l.scope_type}:${l.scope_id}`} className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={l.locked ? "destructive" : "secondary"}>{l.locked ? "Locked" : "Unlocked"}</Badge>
                        <span className="text-sm font-medium">{l.scope_type}</span>
                        <span className="text-xs text-muted-foreground truncate">{l.scope_id}</span>
                      </div>
                      {l.reason && <p className="text-xs text-muted-foreground mt-1 truncate">{l.reason}</p>}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeLock(l)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quotas" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Add quota</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-end">
                <div>
                  <Label className="text-xs">Scope</Label>
                  <Select value={newQType} onValueChange={(v) => setNewQType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="field_manager">Field Manager</SelectItem>
                      <SelectItem value="interviewer">Interviewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Scope ID</Label>
                  <Input value={newQId} onChange={(e) => setNewQId(e.target.value)}
                         placeholder={newQType === "field_manager" ? "FM user UUID" : "Interviewer code"} />
                </div>
                <div>
                  <Label className="text-xs">Metric</Label>
                  <Select value={newQMetric} onValueChange={(v) => setNewQMetric(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interviews">Interviews</SelectItem>
                      <SelectItem value="names">Names</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Limit</Label>
                  <Input type="number" min={1} value={newQLimit} onChange={(e) => setNewQLimit(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Reset at</Label>
                  <Input type="datetime-local" value={newQResetAt} onChange={(e) => setNewQResetAt(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Period</Label>
                  <Select value={newQPeriod} onValueChange={(v) => setNewQPeriod(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_off">One-off</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-3">
                <Button onClick={addQuota} className="gap-1"><Plus className="h-4 w-4" />Add quota</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Active quotas</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-md divide-y">
                {quotas.length === 0 && <p className="p-4 text-sm text-muted-foreground">No quotas configured.</p>}
                {quotas.map((q) => (
                  <QuotaRowItem key={`${q.scope_type}:${q.scope_id}:${q.metric}`} q={q} onRemove={() => removeQuota(q)} />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const QuotaRowItem = ({ q, onRemove }: { q: QuotaRow; onRemove: () => void }) => {
  const [usage, setUsage] = useState<{ used: number; limit: number | null } | null>(null);
  useEffect(() => {
    supabase.rpc("get_upload_quota_usage", {
      _scope_type: q.scope_type, _scope_id: q.scope_id, _metric: q.metric,
    }).then(({ data }) => {
      if (data) setUsage({ used: Number((data as any).used || 0), limit: (data as any).limit ?? null });
    });
  }, [q.scope_type, q.scope_id, q.metric]);
  const pct = usage && usage.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  return (
    <div className="p-3 flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{q.scope_type}</Badge>
          <span className="text-xs text-muted-foreground">{q.scope_id}</span>
          <Badge>{q.metric}</Badge>
          <span className="text-sm font-medium">{usage?.used ?? "…"} / {q.limit_value}</span>
          <span className="text-xs text-muted-foreground">resets {q.reset_period}{q.reset_at ? ` @ ${new Date(q.reset_at).toLocaleString()}` : ""}</span>
        </div>
        <div className="h-1.5 w-full bg-muted rounded mt-2 overflow-hidden">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
};

export default UploadControls;