import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Summary { currency: string; total_charged: number; total_paid: number; balance: number; open_count: number; }

export const PenaltyBalanceCard = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Summary[]>([]);
  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_penalty_summary", { _user_id: user.id }).then(({ data }) => setRows((data as Summary[]) || []));
  }, [user?.id]);

  if (rows.length === 0 || rows.every(r => Number(r.balance) <= 0 && Number(r.total_charged) <= 0)) return null;

  return (
    <Card className="border-amber-500/40">
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <CardTitle className="text-sm">Penalty balance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{r.currency}</span>
            <span className="font-mono font-medium">{r.currency} {Number(r.balance).toLocaleString()}</span>
          </div>
        ))}
        <Button asChild variant="outline" size="sm" className="w-full"><Link to="/my-penalties">View details</Link></Button>
      </CardContent>
    </Card>
  );
};