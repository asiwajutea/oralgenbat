import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (conversationId: string) => void;
}

export const NewChatDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const { user, profile, userRole } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, { id: string; name: string }>>({});
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelected({});
      setTitle("");
    }
  }, [open]);

  const isSuperAdmin = userRole === "super_admin";
  const callerContractor = profile?.active_contractor_id || profile?.contractor_id;

  // Candidate users: same contractor only (super_admin sees everyone)
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["chat-candidates", callerContractor, isSuperAdmin],
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, full_name, email, contractor_id")
        .eq("is_approved", true)
        .order("full_name");
      if (!isSuperAdmin && callerContractor) {
        q = q.eq("contractor_id", callerContractor);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).filter((p) => p.id !== user?.id);
    },
    enabled: open && !!user?.id,
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return candidates;
    return candidates.filter(
      (c) =>
        c.full_name?.toLowerCase().includes(s) ||
        c.email?.toLowerCase().includes(s)
    );
  }, [candidates, search]);

  const selectedList = Object.values(selected);
  const isGroup = selectedList.length > 1;

  const handleCreate = async () => {
    if (selectedList.length === 0) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("create_chat_conversation", {
        _participant_ids: selectedList.map((p) => p.id),
        _title: isGroup ? title || `Group with ${selectedList.length} people` : null,
        _type: isGroup ? "group" : "direct",
        _category: isGroup ? "group" : "direct",
      });
      if (error) throw error;
      onCreated(data as string);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Could not create conversation");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = (p: any) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = { id: p.id, name: p.full_name || p.email };
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>
            {isSuperAdmin
              ? "You can message anyone on the platform."
              : `Within contractor ${callerContractor || "—"}. Cross-contractor chat is restricted.`}
          </DialogDescription>
        </DialogHeader>

        {selectedList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedList.map((p) => (
              <Badge key={p.id} variant="secondary" className="gap-1 pr-1">
                {p.name}
                <button onClick={() => toggle({ id: p.id })} className="ml-1 hover:bg-muted rounded">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {isGroup && (
          <Input
            placeholder="Group title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="h-72 border rounded-md">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No matching users.</div>
          ) : (
            filtered.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-accent cursor-pointer"
              >
                <Checkbox
                  checked={!!selected[p.id]}
                  onCheckedChange={() => toggle(p)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                </div>
                {p.contractor_id && (
                  <Badge variant="outline" className="text-xs">{p.contractor_id}</Badge>
                )}
              </label>
            ))
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={selectedList.length === 0 || submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : "Start chat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};