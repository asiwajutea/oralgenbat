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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-5xl">
      <header><h1 className="text-2xl font-semibold">My Penalty Charges</h1></header>

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
          <div><CardTitle className="text-base">Charges</CardTitle></div>
          <DeclarePaymentDialog onDone={load} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>When</TableHead><TableHead>Amount</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead><TableHead>Appeal</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {charges.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No charges.</TableCell></TableRow> :
                charges.map(c => <ChargeRow key={c.id} c={c} onDone={load} />)}
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
    </div>
  );
};

const ChargeRow = ({ c, onDone }: { c: Charge; onDone: () => void }) => {
  const appeal = async () => {
    const reason = prompt("Reason for appeal");
    if (!reason) return;
    const { error } = await supabase.rpc("appeal_penalty_charge", { _charge_id: c.id, _reason: reason });
    if (error) toast.error(error.message); else { toast.success("Appeal submitted"); onDone(); }
  };
  return (
    <TableRow>
      <TableCell className="text-xs">{format(new Date(c.created_at), "MMM d")}</TableCell>
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