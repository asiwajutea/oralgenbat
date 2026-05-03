import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ShieldCheck, MinusCircle, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [pickerOpen, setPickerOpen] = useState<null | "blocked" | "team_excepted">(null);
  const [pickerSearch, setPickerSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: pol }, { data: blocks }, { data: us }] = await Promise.all([
      supabase.from("chat_global_policy").select("*").eq("id", 1).maybeSingle(),
      supabase.from("chat_user_blocks").select("blocked_user_id"),
      supabase.from("profiles").select("id, full_name, email").eq("is_approved", true).order("full_name").limit(500),
    ]);
    if (pol) setPolicy(pol as any);
    setBlockedIds((blocks || []).map((b: any) => b.blocked_user_id));
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

  const setBlocked = async (ids: string[]) => {
    const toAdd = ids.filter((i) => !blockedIds.includes(i));
    const toRemove = blockedIds.filter((i) => !ids.includes(i));
    if (toAdd.length) await supabase.from("chat_user_blocks").insert(toAdd.map((i) => ({ blocked_user_id: i })));
    if (toRemove.length) await supabase.from("chat_user_blocks").delete().in("blocked_user_id", toRemove);
    setBlockedIds(ids);
  };

  const userName = (id: string) => users.find((u) => u.id === id)?.full_name || id.slice(0, 8);
  const filteredUsers = users.filter((u) => {
    const s = pickerSearch.toLowerCase();
    if (!s) return true;
    return u.full_name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s);
  });

  const currentSelection = pickerOpen === "blocked" ? blockedIds : policy.team_chats_excepted_user_ids;
  const togglePick = (id: string) => {
    const cur = currentSelection;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    if (pickerOpen === "blocked") setBlockedIds(next);
    else setPolicy({ ...policy, team_chats_excepted_user_ids: next });
  };
  const commitPicker = async () => {
    if (pickerOpen === "blocked") await setBlocked(blockedIds);
    else await savePolicy({ team_chats_excepted_user_ids: policy.team_chats_excepted_user_ids });
    setPickerOpen(null);
  };

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
                  {blockedIds.map((id) => (
                    <Badge key={id} variant="secondary" className="gap-1">
                      {userName(id)}
                      <button onClick={() => setBlocked(blockedIds.filter((x) => x !== id))}><X className="h-3 w-3" /></button>
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
            <DialogTitle>{pickerOpen === "blocked" ? "Select blocked users" : "Select excepted users"}</DialogTitle>
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
            <Button variant="outline" onClick={() => setPickerOpen(null)}>Cancel</Button>
            <Button onClick={commitPicker}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatPolicies;
