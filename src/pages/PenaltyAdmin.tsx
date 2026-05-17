import { useEffect, useState } from "react";
import { Plus, Trash2, ShieldOff, CheckCircle2, XCircle, Search, HelpCircle, DollarSign, CreditCard, AlertCircle, FileWarning, Receipt, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScopePicker } from "@/components/penalty/ScopePicker";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SummaryCard } from "@/components/analytics/SummaryCard";

interface Setting {
  id: string; set_by: string; set_by_role: string;
  scope_type: string; scope_id: string | null;
  target_role: string; charge_mode: string; amount: number; currency: string;
  effective_from: string; is_active: boolean;
}
interface Charge {
  id: string; audit_id: string; charged_user_id: string; charged_user_role: string;
  amount: number; currency: string; status: string; paid_amount: number;
  appeal_status: string | null; appeal_reason: string | null;
  created_at: string;
}
interface Payment {
  id: string; charge_id: string | null; charged_user_id: string;
  amount: number; currency: string; status: string; declared_at: string; note: string | null;
}

const PenaltyAdmin = () => {
  const { userRole } = useAuth();
  const canManage = ["admin", "super_admin", "contractor", "sub_contractor"].includes(userRole || "");

  if (!canManage) {
    return <div className="container mx-auto py-10 text-sm text-muted-foreground">You don't have access to this page.</div>;
  }

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold">Penalty Charges</h1>
        <p className="text-sm text-muted-foreground">Configure penalties for failed first audits, manage exemptions, and confirm payments.</p>
      </header>

      <AdminPenaltySummary />

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="charges">Charges</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
        <TabsContent value="charges"><ChargesTab /></TabsContent>
        <TabsContent value="payments"><PaymentsTab /></TabsContent>
      </Tabs>
    </div>
  );
};

const SettingsTab = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Setting[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Setting | null>(null);
  const [form, setForm] = useState({
    scope_type: "global", scope_id: "", target_role: "field_manager",
    charge_mode: "per_interview", amount: 500, currency: "NGN",
    effective_from: "2026-04-21", is_active: true,
  });

  const load = async () => {
    const { data } = await supabase.from("penalty_settings").select("*").order("created_at", { ascending: false });
    setRows((data as Setting[]) || []);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ scope_type: "global", scope_id: "", target_role: "field_manager", charge_mode: "per_interview", amount: 500, currency: "NGN", effective_from: "2026-04-21", is_active: true });
    setOpen(true);
  };
  const openEdit = (s: Setting) => {
    setEditing(s);
    setForm({
      scope_type: s.scope_type, scope_id: s.scope_id || "",
      target_role: s.target_role, charge_mode: s.charge_mode,
      amount: Number(s.amount), currency: s.currency, effective_from: s.effective_from, is_active: s.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    const payload: any = {
      ...form,
      scope_id: form.scope_type === "global" ? null : form.scope_id || null,
      set_by: user.id,
      set_by_role: "admin",
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };
    let res;
    if (editing) res = await supabase.from("penalty_settings").update(payload).eq("id", editing.id);
    else res = await supabase.from("penalty_settings").insert(payload);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success("Saved");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this penalty setting?")) return;
    const { error } = await supabase.from("penalty_settings").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); load(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Penalty rules</CardTitle>
          <CardDescription>One rule per scope + target role. Effective date is editable.</CardDescription>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New rule</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scope</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Effective from</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">No penalty rules yet.</TableCell></TableRow>
            ) : rows.map(r => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => openEdit(r)}>
                <TableCell className="text-xs">{r.scope_type}{r.scope_id ? `: ${r.scope_id}` : ""}</TableCell>
                <TableCell className="text-xs">{r.target_role.replace("_", " ")}</TableCell>
                <TableCell className="text-xs">{r.charge_mode === "per_name" ? "Per name" : "Per interview"}</TableCell>
                <TableCell className="text-xs font-mono">{r.currency} {Number(r.amount).toLocaleString()}</TableCell>
                <TableCell className="text-xs">{r.effective_from}</TableCell>
                <TableCell>{r.is_active ? <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700">Active</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); remove(r.id); }}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit rule" : "New penalty rule"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Scope</Label>
                  <Select value={form.scope_type} onValueChange={v => setForm({ ...form, scope_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global</SelectItem>
                      <SelectItem value="contractor">Contractor</SelectItem>
                      <SelectItem value="sub_contractor">Sub-contractor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Scope target</Label>
                  {form.scope_type === "global" ? (
                    <Input disabled value="All users" />
                  ) : (
                    <ScopePicker
                      scopeType={form.scope_type as "contractor" | "sub_contractor"}
                      value={form.scope_id}
                      onChange={(id) => setForm({ ...form, scope_id: id })}
                    />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Target role</Label>
                  <Select value={form.target_role} onValueChange={v => setForm({ ...form, target_role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="field_manager">Field manager</SelectItem>
                      <SelectItem value="sub_contractor">Sub-contractor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Charge mode</Label>
                  <Select value={form.charge_mode} onValueChange={v => setForm({ ...form, charge_mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_interview">Per interview</SelectItem>
                      <SelectItem value="per_name">Per name</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Amount</Label>
                  <Input type="number" min={0} value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label>Currency</Label>
                  <Input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                </div>
                <div className="space-y-1">
                  <Label>Effective from</Label>
                  <Input type="date" value={form.effective_from} onChange={e => setForm({ ...form, effective_from: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
              {editing && <ExemptionPanel settingId={editing.id} />}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

const ExemptionPanel = ({ settingId }: { settingId: string }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [cascade, setCascade] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("penalty_exemptions").select("id, exempt_user_id, cascade_to_subordinates").eq("setting_id", settingId);
    if (!data) { setRows([]); return; }
    const ids = data.map(d => d.exempt_user_id);
    const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] } as any;
    setRows(data.map(d => ({ ...d, profile: (profiles || []).find((p: any) => p.id === d.exempt_user_id) })));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [settingId]);

  const doSearch = async () => {
    if (!search.trim()) { setResults([]); return; }
    const { data } = await supabase.from("profiles").select("id, full_name, email").or(`full_name.ilike.%${search}%,email.ilike.%${search}%`).limit(10);
    setResults(data || []);
  };

  const add = async (userId: string) => {
    const { error } = await supabase.from("penalty_exemptions").insert({ setting_id: settingId, exempt_user_id: userId, cascade_to_subordinates: cascade });
    if (error) toast.error(error.message);
    else { setSearch(""); setResults([]); load(); }
  };
  const remove = async (id: string) => {
    await supabase.from("penalty_exemptions").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-2 border-t pt-3">
      <Label>Exemptions</Label>
      <div className="flex flex-wrap gap-2">
        {rows.map(r => (
          <Badge key={r.id} variant="secondary" className="gap-1">
            {r.profile?.full_name || r.exempt_user_id.slice(0, 8)}
            {r.cascade_to_subordinates && <span className="text-[10px]">+ subs</span>}
            <button onClick={() => remove(r.id)}><XCircle className="h-3 w-3 ml-1" /></button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2 items-center">
        <Input placeholder="Search user…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} />
        <Button variant="outline" size="icon" onClick={doSearch}><Search className="h-4 w-4" /></Button>
        <div className="flex items-center gap-1 text-xs">
          <Switch checked={cascade} onCheckedChange={setCascade} /> cascade
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground"><HelpCircle className="h-3.5 w-3.5" /></button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              When ON, every Field Manager under this Sub-Contractor is also exempted.
              Example: a Sub-Contractor is on agreed leave — toggle cascade ON so every FM under them is also skipped from this penalty while the exemption is active.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      {results.length > 0 && (
        <ul className="border rounded-md text-xs">
          {results.map(r => (
            <li key={r.id} className="flex items-center justify-between p-2">
              <span>{r.full_name} <span className="text-muted-foreground">({r.email})</span></span>
              <Button size="sm" variant="outline" onClick={() => add(r.id)}>Exempt</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ChargesTab = () => {
  const [rows, setRows] = useState<Charge[]>([]);
  const [auditMap, setAuditMap] = useState<Record<string, string>>({});
  const load = async () => {
    const { data } = await supabase.from("penalty_charges").select("*").order("created_at", { ascending: false }).limit(500);
    const list = (data as Charge[]) || [];
    setRows(list);
    const ids = Array.from(new Set(list.map((r) => r.audit_id).filter(Boolean)));
    if (ids.length) {
      const { data: audits } = await supabase.from("audits").select("id, file_name").in("id", ids);
      const map: Record<string, string> = {};
      (audits || []).forEach((a: any) => { map[a.id] = a.file_name; });
      setAuditMap(map);
    }
  };
  useEffect(() => { load(); }, []);

  const removeCharge = async (id: string) => {
    const reason = prompt("Reason for removing this charge?");
    if (!reason) return;
    const { error } = await supabase.rpc("remove_penalty_charge", { _charge_id: id, _reason: reason });
    if (error) toast.error(error.message);
    else { toast.success("Removed"); load(); }
  };

  const decideAppeal = async (id: string, accept: boolean) => {
    const note = prompt(accept ? "Optional note" : "Reason for rejecting appeal");
    const { error } = await supabase.rpc("decide_penalty_appeal", { _charge_id: id, _accept: accept, _note: note });
    if (error) toast.error(error.message);
    else { toast.success("Done"); load(); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">All charges</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Interview</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Appeal</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">No charges.</TableCell></TableRow> :
              rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{format(new Date(r.created_at), "MMM d")}</TableCell>
                  <TableCell className="text-xs font-mono">{auditMap[r.audit_id] || "—"}</TableCell>
                  <TableCell className="text-xs font-mono">{r.charged_user_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs">{r.charged_user_role.replace("_", " ")}</TableCell>
                  <TableCell className="text-xs font-mono">{r.currency} {Number(r.amount).toLocaleString()}</TableCell>
                  <TableCell className="text-xs font-mono">{r.currency} {Number(r.paid_amount).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                  <TableCell className="text-xs">
                    {r.appeal_status === "pending" ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => decideAppeal(r.id, true)}><CheckCircle2 className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" onClick={() => decideAppeal(r.id, false)}><XCircle className="h-3 w-3" /></Button>
                      </div>
                    ) : (r.appeal_status || "-")}
                  </TableCell>
                  <TableCell>
                    {r.status !== "removed" && r.status !== "waived" && (
                      <Button variant="ghost" size="icon" onClick={() => removeCharge(r.id)}><ShieldOff className="h-4 w-4 text-red-500" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

const PaymentsTab = () => {
  const [rows, setRows] = useState<Payment[]>([]);
  const load = async () => {
    const { data } = await supabase.from("penalty_payments").select("*").order("declared_at", { ascending: false }).limit(500);
    setRows((data as Payment[]) || []);
  };
  useEffect(() => { load(); }, []);

  const decide = async (id: string, accept: boolean) => {
    const note = prompt(accept ? "Optional note" : "Reason for rejecting") || undefined;
    const { error } = await supabase.rpc("confirm_penalty_payment", { _payment_id: id, _accept: accept, _note: note });
    if (error) toast.error(error.message);
    else { toast.success("Done"); load(); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Payments</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No payments.</TableCell></TableRow> :
              rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{format(new Date(r.declared_at), "MMM d HH:mm")}</TableCell>
                  <TableCell className="text-xs font-mono">{r.charged_user_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs font-mono">{r.currency} {Number(r.amount).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[300px] truncate">{r.note}</TableCell>
                  <TableCell>
                    {r.status === "pending_confirmation" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => decide(r.id, true)}><CheckCircle2 className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" onClick={() => decide(r.id, false)}><XCircle className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

const AdminPenaltySummary = () => {
  const [charges, setCharges] = useState<{ amount: number; paid_amount: number; currency: string; status: string }[]>([]);
  const [payments, setPayments] = useState<{ amount: number; currency: string; declared_at: string; status: string }[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from("penalty_charges").select("amount, paid_amount, currency, status"),
        supabase.from("penalty_payments").select("amount, currency, declared_at, status").order("declared_at", { ascending: false }),
      ]);
      setCharges((c as any[]) || []);
      setPayments((p as any[]) || []);
    })();
  }, []);

  const totalCharged = charges.reduce((a, c) => a + Number(c.amount || 0), 0);
  const totalPaid = charges.reduce((a, c) => a + Number(c.paid_amount || 0), 0);
  const balance = totalCharged - totalPaid;
  const openCount = charges.filter((c) => c.status === "open" || c.status === "partial").length;
  const currency = charges[0]?.currency || "";
  const lastPayment = payments.find((p) => p.status === "confirmed")?.declared_at || payments[0]?.declared_at;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      <SummaryCard title="Total charged" value={`${currency} ${totalCharged.toLocaleString()}`} icon={<DollarSign className="h-4 w-4" />} />
      <SummaryCard title="Total paid" value={`${currency} ${totalPaid.toLocaleString()}`} icon={<CreditCard className="h-4 w-4" />} />
      <SummaryCard title="Outstanding" value={`${currency} ${balance.toLocaleString()}`} icon={<AlertCircle className={`h-4 w-4 ${balance > 0 ? "text-red-600" : ""}`} />} />
      <SummaryCard title="Open charges" value={openCount} icon={<FileWarning className="h-4 w-4" />} />
      <SummaryCard title="Payments" value={payments.length} icon={<Receipt className="h-4 w-4" />} />
      <SummaryCard title="Last payment" value={lastPayment ? format(new Date(lastPayment), "MMM d") : "—"} icon={<CalendarClock className="h-4 w-4" />} />
    </div>
  );
};

export default PenaltyAdmin;