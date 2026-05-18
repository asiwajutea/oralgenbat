import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SummaryCard } from "@/components/analytics/SummaryCard";
import { DollarSign, CreditCard, AlertCircle, FileWarning, Receipt, CalendarClock } from "lucide-react";

interface Charge {
  id: string; audit_id: string; amount: number; currency: string;
  status: string; paid_amount: number; appeal_status: string | null; created_at: string;
}
interface Payment { id: string; charge_id: string | null; amount: number; currency: string; status: string; declared_at: string; note: string | null; }
interface Summary { currency: string; total_charged: number; total_paid: number; balance: number; open_count: number; }

const MyPenalties = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [auditMap, setAuditMap] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [appealBusy, setAppealBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const [{ data: s }, { data: c }, { data: p }] = await Promise.all([
      supabase.rpc("get_penalty_summary", { _user_id: user.id }),
      supabase.from("penalty_charges").select("*").eq("charged_user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("penalty_payments").select("*").eq("charged_user_id", user.id).order("declared_at", { ascending: false }),
    ]);
    setSummary((s as Summary[]) || []);
    setCharges((c as Charge[]) || []);
    setPayments((p as Payment[]) || []);
    setSelected(new Set());
    const ids = Array.from(new Set(((c as Charge[]) || []).map((r) => r.audit_id).filter(Boolean)));
    if (ids.length) {
      const { data: audits } = await supabase.from("audits").select("id, file_name").in("id", ids);
      const map: Record<string, string> = {};
      (audits || []).forEach((a: any) => { map[a.id] = a.file_name; });
      setAuditMap(map);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-5xl">
      <header><h1 className="text-2xl font-semibold">My Penalty Charges</h1></header>

      {(() => {
        const totalCharged = summary.reduce((a, s) => a + Number(s.total_charged || 0), 0);
        const totalPaid = summary.reduce((a, s) => a + Number(s.total_paid || 0), 0);
        const balance = summary.reduce((a, s) => a + Number(s.balance || 0), 0);
        const openCount = summary.reduce((a, s) => a + Number(s.open_count || 0), 0);
        const currency = summary[0]?.currency || "";
        const lastPayment = payments[0]?.declared_at;
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
      })()}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {summary.length === 0 ? (
          <Card><CardContent className="py-6 text-sm text-muted-foreground">No penalties. ✨</CardContent></Card>
        ) : summary.map((s, i) => (
          <Card key={i}>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{s.currency}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <div className="text-xs">Total charged: <span className="font-mono">{s.currency} {Number(s.total_charged).toLocaleString()}</span></div>
              <div className="text-xs">Paid: <span className="font-mono">{s.currency} {Number(s.total_paid).toLocaleString()}</span></div>
              <div className="text-lg font-semibold">Balance: {s.currency} {Number(s.balance).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{s.open_count} open</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Charges</CardTitle>
            {selected.size > 0 && (
              <>
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                <Button size="sm" variant="outline" onClick={() => { setAppealReason(""); setAppealOpen(true); }}>
                  Mark as appealed
                </Button>
              </>
            )}
          </div>
          <DeclarePaymentDialog onDone={load} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={(() => {
                    const eligible = charges.filter(c => !c.appeal_status && c.status !== "waived" && c.status !== "removed" && c.status !== "paid");
                    return eligible.length > 0 && eligible.every(c => selected.has(c.id));
                  })()}
                  onChange={() => {
                    const eligibleIds = charges.filter(c => !c.appeal_status && c.status !== "waived" && c.status !== "removed" && c.status !== "paid").map(c => c.id);
                    const allSel = eligibleIds.length > 0 && eligibleIds.every(id => selected.has(id));
                    setSelected(allSel ? new Set() : new Set(eligibleIds));
                  }}
                />
              </TableHead>
              <TableHead>When</TableHead><TableHead>Interview</TableHead><TableHead>Amount</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead><TableHead>Appeal</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {charges.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">No charges.</TableCell></TableRow> :
                charges.map(c => (
                  <ChargeRow
                    key={c.id}
                    c={c}
                    fileName={auditMap[c.audit_id]}
                    onDone={load}
                    selected={selected.has(c.id)}
                    onToggle={() => {
                      const s = new Set(selected);
                      if (s.has(c.id)) s.delete(c.id); else s.add(c.id);
                      setSelected(s);
                    }}
                  />
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">My payments</CardTitle><CardDescription>Lifetime payment history.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
            <TableBody>
              {payments.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No payments yet.</TableCell></TableRow> :
                payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{format(new Date(p.declared_at), "MMM d HH:mm")}</TableCell>
                    <TableCell className="text-xs font-mono">{p.currency} {Number(p.amount).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="secondary">{p.status}</Badge></TableCell>
                    <TableCell className="text-xs">{p.note}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={appealOpen} onOpenChange={setAppealOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Appeal {selected.size} charge{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The same reason will be submitted for each selected charge. An admin will review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason for appeal…"
            value={appealReason}
            onChange={(e) => setAppealReason(e.target.value)}
            rows={4}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={appealBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!appealReason.trim() || appealBusy}
              onClick={async () => {
                setAppealBusy(true);
                let ok = 0, fail = 0;
                for (const id of Array.from(selected)) {
                  const { error } = await supabase.rpc("appeal_penalty_charge", { _charge_id: id, _reason: appealReason.trim() });
                  if (error) fail++; else ok++;
                }
                setAppealBusy(false);
                setAppealOpen(false);
                toast.success(`${ok} appealed${fail ? `, ${fail} failed` : ""}`);
                load();
              }}
            >
              {appealBusy ? "Submitting…" : "Submit appeals"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const ChargeRow = ({ c, fileName, onDone, selected, onToggle }: { c: Charge; fileName?: string; onDone: () => void; selected?: boolean; onToggle?: () => void }) => {
  const appeal = async () => {
    const reason = prompt("Reason for appeal");
    if (!reason) return;
    const { error } = await supabase.rpc("appeal_penalty_charge", { _charge_id: c.id, _reason: reason });
    if (error) toast.error(error.message); else { toast.success("Appeal submitted"); onDone(); }
  };
  return (
    <TableRow>
      <TableCell>
        <input
          type="checkbox"
          checked={!!selected}
          onChange={onToggle}
          disabled={!!c.appeal_status || c.status === "waived" || c.status === "removed" || c.status === "paid"}
          aria-label="Select row"
        />
      </TableCell>
      <TableCell className="text-xs">{format(new Date(c.created_at), "MMM d")}</TableCell>
      <TableCell className="text-xs font-mono">{fileName || "—"}</TableCell>
      <TableCell className="text-xs font-mono">{c.currency} {Number(c.amount).toLocaleString()}</TableCell>
      <TableCell className="text-xs font-mono">{c.currency} {Number(c.paid_amount).toLocaleString()}</TableCell>
      <TableCell><Badge variant="secondary">{c.status}</Badge></TableCell>
      <TableCell className="text-xs">{c.appeal_status || "-"}</TableCell>
      <TableCell className="flex gap-1">
        {!c.appeal_status && c.status !== "waived" && c.status !== "removed" && c.status !== "paid" && <Button size="sm" variant="outline" onClick={appeal}>Appeal</Button>}
        {(c.status === "open" || c.status === "partial") && <DeclarePaymentDialog chargeId={c.id} maxAmount={Number(c.amount) - Number(c.paid_amount)} onDone={onDone} />}
      </TableCell>
    </TableRow>
  );
};

const DeclarePaymentDialog = ({ chargeId, maxAmount, onDone }: { chargeId?: string; maxAmount?: number; onDone: () => void }) => {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(maxAmount || 0);
  const [note, setNote] = useState("");
  const submit = async () => {
    const { error } = await supabase.rpc("declare_penalty_payment", { _charge_id: chargeId || null, _amount: amount, _note: note || null });
    if (error) toast.error(error.message);
    else { toast.success("Payment declared. Awaiting confirmation."); setOpen(false); onDone(); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={chargeId ? "outline" : "default"}>{chargeId ? "Pay" : "Declare payment"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Declare payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Amount</Label><Input type="number" min={0} value={amount} onChange={e => setAmount(Number(e.target.value))} /></div>
          <div className="space-y-1"><Label>Note (optional)</Label><Textarea value={note} onChange={e => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit}>Submit</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MyPenalties;