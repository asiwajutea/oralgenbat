import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Inbox as InboxIcon } from "lucide-react";

/**
 * Shows a blocking nag whenever the current user has un-acknowledged
 * Pass-with-Override warnings in their inbox. Modal disappears for a
 * given audit once the user clicks "Open in inbox", which records an
 * ack row so it never re-shows for that audit.
 */
export const OverrideWarningNagModal = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  const { data: warnings = [] } = useQuery({
    queryKey: ["override-warnings", user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      // Recent override-warning messages addressed to me, that I haven't acked yet
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("id, conversation_id, body, metadata, created_at")
        .contains("metadata", { kind: "pass_override", warn: true } as any)
        .order("created_at", { ascending: false })
        .limit(50);
      if (!msgs?.length) return [];
      // Restrict to conversations the user participates in (RLS already does this,
      // but be defensive in case of cached rows)
      const convIds = Array.from(new Set(msgs.map((m: any) => m.conversation_id)));
      const { data: parts } = await supabase
        .from("chat_participants")
        .select("conversation_id")
        .in("conversation_id", convIds)
        .eq("user_id", user!.id);
      const myConvs = new Set((parts || []).map((p: any) => p.conversation_id));
      const mine = msgs.filter((m: any) => myConvs.has(m.conversation_id));
      // Drop already-acked audits
      const auditIds = Array.from(
        new Set(
          mine
            .map((m: any) => (m.metadata as any)?.audit_id)
            .filter((v: any): v is string => typeof v === "string"),
        ),
      ) as string[];
      if (!auditIds.length) return mine.slice(0, 5);
      const { data: acks } = await supabase
        .from("override_warning_acks" as any)
        .select("audit_id")
        .in("audit_id", auditIds)
        .eq("user_id", user!.id);
      const acked = new Set((acks || []).map((a: any) => a.audit_id));
      // Pick first un-acked per audit
      const seen = new Set<string>();
      const out: any[] = [];
      for (const m of mine) {
        const aid = (m.metadata as any)?.audit_id as string | undefined;
        if (!aid || acked.has(aid) || seen.has(aid)) continue;
        seen.add(aid);
        out.push(m);
        if (out.length >= 5) break;
      }
      return out;
    },
  });

  const visible = useMemo(() => open && warnings.length > 0, [open, warnings.length]);

  useEffect(() => {
    if (warnings.length > 0) setOpen(true);
  }, [warnings.length]);

  if (!user || !visible) return null;

  const ackAndOpen = async (msg: any) => {
    const aid = msg.metadata?.audit_id;
    if (aid) {
      await supabase
        .from("override_warning_acks" as any)
        .upsert({ audit_id: aid, user_id: user.id });
      qc.invalidateQueries({ queryKey: ["override-warnings", user.id] });
    }
    setOpen(false);
    navigate(`/inbox?conversation=${msg.conversation_id}`);
  };

  return (
    <Dialog open={visible} onOpenChange={(v) => setOpen(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Pass-with-Override warning{warnings.length > 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            An auditor flagged the following interview{warnings.length > 1 ? "s" : ""} as a concern about the agent's
            practice. Please open each message in your inbox to acknowledge it.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 max-h-72 overflow-y-auto">
          {warnings.map((w: any) => (
            <li
              key={w.id}
              className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Warning
                </Badge>
                <span className="font-mono text-xs">{w.metadata?.file_name}</span>
              </div>
              <p className="text-xs whitespace-pre-wrap line-clamp-3">{w.body}</p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => ackAndOpen(w)}>
                <InboxIcon className="h-3.5 w-3.5" /> Open in inbox
              </Button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Remind me later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OverrideWarningNagModal;