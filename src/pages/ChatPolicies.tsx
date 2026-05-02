import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

const ROLES = [
  "super_admin",
  "admin",
  "quality_assurance_manager",
  "auditor",
  "contractor",
  "sub_contractor",
  "field_manager",
  "data_entry_clerk",
] as const;

type Policy = { from_role: string; to_role: string; allowed: boolean };

const ChatPolicies = () => {
  const { userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<Policy[]>([]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("chat_messaging_policies").select("from_role, to_role, allowed");
    if (error) toast.error(error.message);
    setPolicies((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const lookup = useMemo(() => {
    const m: Record<string, boolean> = {};
    policies.forEach((p) => { m[`${p.from_role}->${p.to_role}`] = p.allowed; });
    return m;
  }, [policies]);

  if (userRole !== "super_admin") return <Navigate to="/" replace />;

  const toggle = async (from: string, to: string, next: boolean) => {
    const { error } = await supabase
      .from("chat_messaging_policies")
      .upsert({ from_role: from as any, to_role: to as any, allowed: next }, { onConflict: "from_role,to_role" });
    if (error) { toast.error(error.message); return; }
    setPolicies((prev) => {
      const idx = prev.findIndex((p) => p.from_role === from && p.to_role === to);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = { ...cp[idx], allowed: next }; return cp; }
      return [...prev, { from_role: from, to_role: to, allowed: next }];
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Chat Messaging Policies</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Toggle whether a role on the left is allowed to start a direct chat with a role on the top.
        Defaults to allowed if no row exists. Super admins can always message everyone.
      </p>
      <Card>
        <CardHeader><CardTitle>Role Matrix</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="overflow-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left p-2 sticky left-0 bg-background">From \ To</th>
                    {ROLES.map((r) => (
                      <th key={r} className="p-2 text-xs font-medium whitespace-nowrap">{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROLES.map((from) => (
                    <tr key={from} className="border-t">
                      <td className="p-2 font-medium sticky left-0 bg-background whitespace-nowrap">{from}</td>
                      {ROLES.map((to) => {
                        const key = `${from}->${to}`;
                        const allowed = key in lookup ? lookup[key] : true;
                        return (
                          <td key={to} className="p-2 text-center">
                            <Switch
                              checked={allowed}
                              onCheckedChange={(v) => toggle(from, to, v)}
                              disabled={from === "super_admin"}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatPolicies;