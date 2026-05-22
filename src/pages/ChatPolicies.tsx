import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ShieldCheck, MinusCircle, X, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Policy = {
  id?: number;
  all_users_mode: "anyone" | "restricted";
  allow_same_team: boolean;
  allow_same_role: boolean;
  allow_managers_only: boolean;
  team_chats_mode: "anyone" | "restricted";
  team_chats_excepted_user_ids: string[];
};

type UserOpt = { id: string; full_name: string; email: string };
type BlockRow = { blocked_user_id: string; except_user_ids: string[] };
type MatrixRow = { from_role: string; to_role: string; allowed: boolean };

const ROLES = [
  "super_admin",
  "admin",
  "field_manager",
  "contractor",
  "sub_contractor",
  "auditor",
  "data_entry_clerk",
  "quality_assurance_manager",
] as const;

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  field_manager: "Field Mgr",
  contractor: "Contractor",
  sub_contractor: "Sub-Contractor",
  auditor: "Auditor",
  data_entry_clerk: "Data Entry",
  quality_assurance_manager: "QA Mgr",
};

const ChatPolicies = () => {
  const { userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policy, setPolicy] = useState<Policy>({
    all_users_mode: "anyone",
    allow_same_team: false,
    allow_same_role: false,
    allow_managers_only: false,
    team_chats_mode: "anyone",
    team_chats_excepted_user_ids: [],
  });
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [pickerOpen, setPickerOpen] = useState<null | "blocked" | "team_excepted" | { kind: "except"; blockedId: string }>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: pol }, { data: blockRows }, { data: us }, { data: matrixRows }] = await Promise.all([
      supabase.from("chat_global_policy").select("*").eq("id", 1).maybeSingle(),
      supabase.from("chat_user_blocks").select("blocked_user_id, except_user_ids"),
      supabase.from("profiles").select("id, full_name, email").eq("is_approved", true).order("full_name").limit(500),
      supabase.from("chat_messaging_policies").select("from_role, to_role, allowed"),
    ]);
    if (pol) setPolicy(pol as any);
    setBlocks((blockRows || []).map((b: any) => ({
      blocked_user_id: b.blocked_user_id,
      except_user_ids: b.except_user_ids || [],
    })));
    setMatrix((matrixRows || []) as MatrixRow[]);
    setUsers((us || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  if (userRole !== "super_admin") return <Navigate to="/" replace />;

  const savePolicy = async (next: Partial<Policy>) => {
    const merged = { ...policy, ...next };
    setPolicy(merged);
    setSaving(true);
    const { error } = await supabase.from("chat_global_policy").update(merged).eq("id", 1);
    setSaving(false);
    if (error) toast.error(error.message);
  };

  const blockedIds = useMemo(() => blocks.map((b) => b.blocked_user_id), [blocks]);

  const toggleBlocked = async (id: string) => {
    setSaving(true);
    if (blockedIds.includes(id)) {
      // optimistic
      setBlocks((prev) => prev.filter((b) => b.blocked_user_id !== id));
      const { error } = await supabase.from("chat_user_blocks").delete().eq("blocked_user_id", id);
      if (error) { toast.error(error.message); load(); }
    } else {
      setBlocks((prev) => [...prev, { blocked_user_id: id, except_user_ids: [] }]);
      const { error } = await supabase.from("chat_user_blocks").insert({ blocked_user_id: id, except_user_ids: [] });
      if (error) { toast.error(error.message); load(); }
    }
    setSaving(false);
  };

  const toggleExcept = async (blockedId: string, exceptId: string) => {
    const row = blocks.find((b) => b.blocked_user_id === blockedId);
    if (!row) return;
    const next = row.except_user_ids.includes(exceptId)
      ? row.except_user_ids.filter((x) => x !== exceptId)
      : [...row.except_user_ids, exceptId];
    setSaving(true);
    setBlocks((prev) => prev.map((b) => b.blocked_user_id === blockedId ? { ...b, except_user_ids: next } : b));
    const { error } = await supabase.from("chat_user_blocks")
      .update({ except_user_ids: next })
      .eq("blocked_user_id", blockedId);
    setSaving(false);
    if (error) { toast.error(error.message); load(); }
  };

  const toggleTeamExcept = async (id: string) => {
    const next = policy.team_chats_excepted_user_ids.includes(id)
      ? policy.team_chats_excepted_user_ids.filter((x) => x !== id)
      : [...policy.team_chats_excepted_user_ids, id];
    await savePolicy({ team_chats_excepted_user_ids: next });
  };

  const toggleMatrix = async (from_role: string, to_role: string) => {
    const cur = matrix.find((m) => m.from_role === from_role && m.to_role === to_role);
    const next = !(cur?.allowed ?? true);
    setSaving(true);
    setMatrix((prev) => {
      const others = prev.filter((m) => !(m.from_role === from_role && m.to_role === to_role));
      return [...others, { from_role, to_role, allowed: next }];
    });
    const { error } = await supabase.from("chat_messaging_policies")
      .upsert({ from_role: from_role as any, to_role: to_role as any, allowed: next },
              { onConflict: "from_role,to_role" });
    setSaving(false);
    if (error) { toast.error(error.message); load(); }
  };

  const userName = (id: string) => users.find((u) => u.id === id)?.full_name || id.slice(0, 8);
  const filteredUsers = users.filter((u) => {
    const s = pickerSearch.toLowerCase();
    if (!s) return true;
    return u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s);
  });

  const currentSelection: string[] =
    pickerOpen === "blocked"
      ? blockedIds
      : pickerOpen === "team_excepted"
        ? policy.team_chats_excepted_user_ids
        : (pickerOpen && typeof pickerOpen === "object" && pickerOpen.kind === "except"
            ? (blocks.find((b) => b.blocked_user_id === pickerOpen.blockedId)?.except_user_ids || [])
            : []);

  const togglePick = async (id: string) => {
    if (pickerOpen === "blocked") {
      await toggleBlocked(id);
    } else if (pickerOpen === "team_excepted") {
      await toggleTeamExcept(id);
    } else if (pickerOpen && typeof pickerOpen === "object" && pickerOpen.kind === "except") {
      await toggleExcept(pickerOpen.blockedId, id);
    }
  };

  const pickerTitle =
    pickerOpen === "blocked" ? "Select blocked users"
    : pickerOpen === "team_excepted" ? "Select excepted users"
    : (pickerOpen && typeof pickerOpen === "object" && pickerOpen.kind === "except")
      ? `Allow these users to message ${userName(pickerOpen.blockedId)}`
    : "";

  if (loading) {
    return <div className="container mx-auto p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Chat Messaging Policies</h1>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <Card>
        <CardHeader><CardTitle>All users permissions</CardTitle></CardHeader>
        <CardContent>
          <RadioGroup
            value={policy.all_users_mode}
            onValueChange={(v) => savePolicy({ all_users_mode: v as any })}
            className="space-y-4"
          >
            <div className="rounded-md border p-4 bg-muted/30 space-y-3">
              <div className="flex items-start gap-3">
                <RadioGroupItem value="anyone" id="all-anyone" />
                <Label htmlFor="all-anyone" className="cursor-pointer">
                  Users <strong>can</strong> start chat conversations with <strong>anyone</strong>
                </Label>
              </div>
              <div className="flex items-start gap-3">
                <RadioGroupItem value="restricted" id="all-restricted" />
                <div className="flex-1">
                  <Label htmlFor="all-restricted" className="cursor-pointer">
                    Users <strong>can't</strong> start chat conversations with other users
                  </Label>
                  {policy.all_users_mode === "restricted" && (
                    <div className="ml-2 mt-3 space-y-2 pl-4 border-l">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={policy.allow_same_team}
                          onCheckedChange={(v) => savePolicy({ allow_same_team: !!v })}
                          id="same-team"
                        />
                        <Label htmlFor="same-team" className="text-sm">Unless they share the same contractor</Label>
                      </div>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={policy.allow_same_role}
                          onCheckedChange={(v) => savePolicy({ allow_same_role: !!v })}
                          id="same-role"
                        />
                        <Label htmlFor="same-role" className="text-sm">Unless they share the same role</Label>
                      </div>
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={policy.allow_managers_only}
                          onCheckedChange={(v) => savePolicy({ allow_managers_only: !!v })}
                          id="managers-only"
                        />
                        <Label htmlFor="managers-only" className="text-sm">Unless those other users are their direct managers (Field Manager / Contractor)</Label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </RadioGroup>

          <div className="mt-4 rounded-md border p-4 bg-destructive/5 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <MinusCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium">Users <strong>can never</strong> start a chat conversation with</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {blockedIds.length === 0 && <span className="text-xs text-muted-foreground">No users selected</span>}
                  {blocks.map((b) => (
                    <Badge key={b.blocked_user_id} variant="secondary" className="gap-1 pr-1">
                      {userName(b.blocked_user_id)}
                      {b.except_user_ids.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">· except {b.except_user_ids.length}</span>
                      )}
                      <button
                        title="Manage exceptions"
                        className="ml-1 p-0.5 hover:bg-background rounded"
                        onClick={() => { setPickerOpen({ kind: "except", blockedId: b.blocked_user_id }); setPickerSearch(""); }}
                      >
                        <Settings2 className="h-3 w-3" />
                      </button>
                      <button title="Remove" onClick={() => toggleBlocked(b.blocked_user_id)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <Button variant="link" onClick={() => { setPickerOpen("blocked"); setPickerSearch(""); }}>
              {blockedIds.length > 0 ? `${blockedIds.length} selected` : "Select users"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Role permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Toggle which roles (rows) can start a chat with which roles (columns). Super Admin and Admin always pass through, regardless of the matrix.
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="p-1 text-left">From \\ To</th>
                  {ROLES.map((r) => (
                    <th key={r} className="p-1 text-center font-medium">{ROLE_LABEL[r]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLES.map((from) => (
                  <tr key={from}>
                    <td className="p-1 font-medium">{ROLE_LABEL[from]}</td>
                    {ROLES.map((to) => {
                      const cur = matrix.find((m) => m.from_role === from && m.to_role === to);
                      const allowed = cur?.allowed ?? true;
                      const isPinned = from === "super_admin" || from === "admin";
                      return (
                        <td key={to} className="p-1 text-center">
                          <button
                            disabled={isPinned}
                            onClick={() => toggleMatrix(from, to)}
                            className={cn(
                              "h-7 w-12 rounded-md text-[10px] font-medium border transition",
                              allowed
                                ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
                                : "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20",
                              isPinned && "opacity-60 cursor-not-allowed"
                            )}
                          >
                            {allowed ? "✓" : "✕"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Team chat permissions</CardTitle></CardHeader>
        <CardContent>
          <RadioGroup
            value={policy.team_chats_mode}
            onValueChange={(v) => savePolicy({ team_chats_mode: v as any })}
            className="space-y-3"
          >
            <div className="flex items-center gap-3">
              <RadioGroupItem value="anyone" id="team-anyone" />
              <Label htmlFor="team-anyone" className="cursor-pointer">
                Users <strong>can</strong> create new team chats
                <button
                  className="ml-2 text-primary underline text-sm"
                  onClick={() => { setPickerOpen("team_excepted"); setPickerSearch(""); }}
                >
                  Except {policy.team_chats_excepted_user_ids.length > 0 ? `${policy.team_chats_excepted_user_ids.length} users` : "…"}
                </button>
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="restricted" id="team-restricted" />
              <Label htmlFor="team-restricted" className="cursor-pointer">
                Users <strong>can't</strong> create new team chats
                <button
                  className="ml-2 text-primary underline text-sm"
                  onClick={() => { setPickerOpen("team_excepted"); setPickerSearch(""); }}
                >
                  Except {policy.team_chats_excepted_user_ids.length > 0 ? `${policy.team_chats_excepted_user_ids.length} users` : "…"}
                </button>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Note: Super admins and admins can always message everyone. These rules apply to all other roles.
      </p>

      <Dialog open={!!pickerOpen} onOpenChange={(o) => !o && setPickerOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pickerTitle}</DialogTitle>
          </DialogHeader>
          <Input placeholder="Search…" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} />
          <ScrollArea className="h-72 border rounded-md">
            {filteredUsers.map((u) => {
              const checked = currentSelection.includes(u.id);
              return (
                <label key={u.id} className="flex items-center gap-3 px-3 py-2 hover:bg-accent cursor-pointer">
                  <Checkbox checked={checked} onCheckedChange={() => togglePick(u.id)} />
                  <div className="min-w-0">
                    <p className="text-sm truncate">{u.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                </label>
              );
            })}
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setPickerOpen(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatPolicies;
