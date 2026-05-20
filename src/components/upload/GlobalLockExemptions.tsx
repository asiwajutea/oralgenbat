import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { UploadScopePicker } from "./UploadScopePicker";

type Row = { id: string; scope_type: "user" | "role"; scope_value: string; reason: string | null; label?: string };

const ROLES = [
  "admin", "super_admin", "contractor", "sub_contractor",
  "field_manager", "auditor", "data_entry_clerk",
  "quality_assurance_manager", "interviewer",
];

export const GlobalLockExemptions = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [kind, setKind] = useState<"user" | "role">("user");
  const [userId, setUserId] = useState("");
  const [userLabel, setUserLabel] = useState("");
  const [role, setRole] = useState("");
  const [reason, setReason] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("upload_lock_exemptions")
      .select("id, scope_type, scope_value, reason")
      .order("scope_type");
    const list = (data || []) as Row[];
    // Hydrate user labels
    const userIds = list.filter(r => r.scope_type === "user").map(r => r.scope_value);
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      const map = new Map((profs || []).map(p => [p.id, `${p.full_name || "Unknown"} (${p.email || "—"})`]));
      for (const r of list) if (r.scope_type === "user") r.label = map.get(r.scope_value) || r.scope_value;
    }
    setRows(list);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    const scope_value = kind === "user" ? userId : role;
    if (!scope_value) { toast.error(kind === "user" ? "Pick a user" : "Pick a role"); return; }
    const { error } = await supabase.from("upload_lock_exemptions")
      .upsert({
        scope_type: kind,
        scope_value,
        reason: reason || null,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      }, { onConflict: "scope_type,scope_value" });
    if (error) { toast.error(error.message); return; }
    toast.success("Exemption added");
    setUserId(""); setUserLabel(""); setRole(""); setReason("");
    load();
  };

  const remove = async (r: Row) => {
    const { error } = await supabase.from("upload_lock_exemptions").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Global lock exemptions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Users or roles listed here can still upload while the global lock is active.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_1fr_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">Exempt</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Specific user</SelectItem>
                <SelectItem value="role">Entire role</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{kind === "user" ? "User" : "Role"}</Label>
            {kind === "user" ? (
              <UploadScopePicker
                kind="user"
                value={userId}
                onChange={(id, label) => { setUserId(id); setUserLabel(label || ""); }}
                placeholder="Search name or email…"
              />
            ) : (
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue placeholder="Pick role" /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (<SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <Button onClick={add} className="gap-1"><Plus className="h-4 w-4" />Add</Button>
        </div>

        <div className="border rounded-md divide-y">
          {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">No exemptions.</p>}
          {rows.map(r => (
            <div key={r.id} className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{r.scope_type}</Badge>
                  <span className="text-sm font-medium truncate">
                    {r.scope_type === "role" ? r.scope_value.replace(/_/g, " ") : (r.label || r.scope_value)}
                  </span>
                </div>
                {r.reason && <p className="text-xs text-muted-foreground mt-1 truncate">{r.reason}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};