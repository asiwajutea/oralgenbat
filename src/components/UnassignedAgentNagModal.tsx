import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const RECUR_MS = 30 * 60 * 1000; // 30 min

/**
 * Recurring nag modal that warns admins / sub_contractors / super_admins
 * when interviewer codes exist with no approved team_assignments row.
 */
export const UnassignedAgentNagModal = () => {
  const { user, userRole, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const eligible =
    !!user &&
    (userRole === "admin" || userRole === "super_admin" || userRole === "sub_contractor");

  const effectiveCid = profile?.active_contractor_id || profile?.contractor_id;
  const isSuperAdmin = userRole === "super_admin";

  const { data: unassigned = [] } = useQuery({
    queryKey: ["unassigned-agents-nag", effectiveCid, userRole, tick],
    enabled: eligible,
    staleTime: 60_000,
    queryFn: async () => {
      let metaQ = supabase
        .from("interview_metadata")
        .select("interviewer_code, interviewer_name, contractor_id");
      if (!isSuperAdmin && effectiveCid) {
        metaQ = metaQ.eq("contractor_id", effectiveCid);
      }
      const { data: meta } = await metaQ;
      const uniq = Array.from(
        new Map(
          (meta || []).map((m) => [
            m.interviewer_code,
            { code: m.interviewer_code, name: m.interviewer_name, contractor_id: m.contractor_id },
          ])
        ).values()
      );
      let asgQ = supabase.from("team_assignments").select("interviewer_code").eq("status", "approved");
      if (!isSuperAdmin && effectiveCid) asgQ = asgQ.eq("contractor_id", effectiveCid);
      const { data: asg } = await asgQ;
      const assigned = new Set((asg || []).map((a) => a.interviewer_code));
      return uniq.filter((u) => u.code && !assigned.has(u.code));
    },
  });

  // Initial open + recurring timer
  useEffect(() => {
    if (!eligible) return;
    if (unassigned.length === 0) return;
    const key = `unassigned-agent-nag-shown-${user!.id}`;
    if (!sessionStorage.getItem(key)) {
      setOpen(true);
      sessionStorage.setItem(key, "1");
    }
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setOpen(true);
    }, RECUR_MS);
    return () => clearInterval(id);
  }, [eligible, unassigned.length, user?.id]);

  if (!eligible || unassigned.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Unassigned agents need attention
          </DialogTitle>
          <DialogDescription>
            {unassigned.length} interviewer{unassigned.length === 1 ? "" : "s"} {unassigned.length === 1 ? "is" : "are"} not assigned to any field manager yet. This reminder will reappear every 30 minutes until resolved.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto space-y-1 border rounded-md p-2">
          {unassigned.slice(0, 25).map((u) => (
            <div key={u.code} className="flex items-center justify-between text-sm py-1">
              <span className="font-mono">{u.code}</span>
              <Badge variant="outline" className="text-xs">{u.name || "—"}</Badge>
            </div>
          ))}
          {unassigned.length > 25 && (
            <p className="text-xs text-muted-foreground pt-1">+ {unassigned.length - 25} more…</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Dismiss</Button>
          <Button onClick={() => { setOpen(false); navigate("/team-approvals"); }}>
            Go to Team Approvals
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UnassignedAgentNagModal;