import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, XCircle, FolderOpen, RefreshCw } from "lucide-react";

const SESSION_KEY = "login_welcome_shown";

const LoginWelcomeModal = () => {
  const { user, userRole, profile } = useAuth();
  const [open, setOpen] = useState(false);

  const isRelevantRole = userRole === "field_manager" || userRole === "contractor" || userRole === "sub_contractor";

  const effectiveContractorId = profile?.active_contractor_id || profile?.contractor_id;

  // Fetch team codes for field managers / sub-contractors
  const { data: teamCodes = [] } = useQuery({
    queryKey: ["welcome-team-codes", user?.id, userRole],
    queryFn: async () => {
      if (!user?.id) return [];

      if (userRole === "field_manager") {
        const { data } = await supabase
          .from("team_assignments")
          .select("interviewer_code")
          .eq("field_manager_id", user.id)
          .eq("status", "approved");
        return data?.map((t) => t.interviewer_code) || [];
      }

      if (userRole === "sub_contractor") {
        // Get assigned FMs
        const { data: fmAssignments } = await supabase
          .from("field_manager_subcontractor_assignments")
          .select("field_manager_id")
          .eq("sub_contractor_id", user.id)
          .eq("is_active", true);

        if (!fmAssignments || fmAssignments.length === 0) return [];

        const fmIds = fmAssignments.map((f) => f.field_manager_id);
        const { data: teamData } = await supabase
          .from("team_assignments")
          .select("interviewer_code")
          .in("field_manager_id", fmIds)
          .eq("status", "approved");

        return teamData?.map((t) => t.interviewer_code) || [];
      }

      return [];
    },
    enabled: isRelevantRole && !!user?.id && (userRole === "field_manager" || userRole === "sub_contractor"),
  });

  // Fetch non-passed interview counts
  const { data: auditSummary } = useQuery({
    queryKey: ["welcome-audit-summary", user?.id, userRole, effectiveContractorId, teamCodes],
    queryFn: async () => {
      if (!user?.id) return null;

      // Fetch all audits with metadata
      const batchSize = 1000;
      let allAudits: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: batch } = await supabase
          .from("audits")
          .select("id, file_name, status, is_re_audit, interview_metadata(contractor_id, interviewer_code, audit_id)")
          .neq("status", "Audit Passed")
          .range(from, from + batchSize - 1);

        if (!batch || batch.length === 0) {
          hasMore = false;
        } else {
          allAudits.push(...batch);
          if (batch.length < batchSize) hasMore = false;
          from += batchSize;
        }
      }

      // Check burn queue to exclude burned interviews
      const auditIds = allAudits.map((a) => a.id);
      let burnedIds = new Set<string>();
      if (auditIds.length > 0) {
        const batchSize2 = 200;
        for (let i = 0; i < auditIds.length; i += batchSize2) {
          const batch = auditIds.slice(i, i + batchSize2);
          const { data: burned } = await supabase
            .from("burn_queue")
            .select("audit_id")
            .in("audit_id", batch)
            .is("restored_at", null);
          if (burned) burned.forEach((b) => burnedIds.add(b.audit_id));
        }
      }

      // Filter by role
      let filtered = allAudits.filter((a) => !burnedIds.has(a.id));

      if (userRole === "contractor" || userRole === "sub_contractor") {
        filtered = filtered.filter((a) => {
          const meta = Array.isArray(a.interview_metadata) ? a.interview_metadata[0] : null;
          return meta?.contractor_id === effectiveContractorId;
        });
      } else if (userRole === "field_manager" && teamCodes.length > 0) {
        filtered = filtered.filter((a) => {
          const meta = Array.isArray(a.interview_metadata) ? a.interview_metadata[0] : null;
          return meta?.interviewer_code && teamCodes.includes(meta.interviewer_code);
        });
      }

      // Categorize
      const categories: Record<string, number> = {};
      filtered.forEach((a) => {
        const meta = Array.isArray(a.interview_metadata) ? a.interview_metadata[0] : null;
        if (a.status === "Audit Failed") {
          categories["Audit Failed"] = (categories["Audit Failed"] || 0) + 1;
        } else if (a.is_re_audit) {
          categories["Re-Audit"] = (categories["Re-Audit"] || 0) + 1;
        } else if (!meta) {
          categories["No Metadata"] = (categories["No Metadata"] || 0) + 1;
        } else {
          categories["Pending/Awaiting"] = (categories["Pending/Awaiting"] || 0) + 1;
        }
      });

      return { total: filtered.length, categories };
    },
    enabled: isRelevantRole && !!user?.id,
  });

  useEffect(() => {
    if (isRelevantRole && auditSummary && auditSummary.total > 0) {
      const shown = sessionStorage.getItem(SESSION_KEY);
      if (!shown) {
        setOpen(true);
      }
    }
  }, [auditSummary, isRelevantRole]);

  const handleAcknowledge = () => {
    sessionStorage.setItem(SESSION_KEY, "true");
    setOpen(false);
  };

  if (!isRelevantRole || !auditSummary || auditSummary.total === 0) return null;

  const firstName = profile?.full_name?.split(" ")[0] || "there";

  const categoryIcons: Record<string, React.ReactNode> = {
    "Audit Failed": <XCircle className="h-4 w-4 text-destructive" />,
    "No Metadata": <FolderOpen className="h-4 w-4 text-orange-500" />,
    "Re-Audit": <RefreshCw className="h-4 w-4 text-blue-500" />,
    "Pending/Awaiting": <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleAcknowledge(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Welcome back, {firstName}! 👋
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
            <AlertTriangle className="h-8 w-8 text-orange-500 shrink-0" />
            <div>
              <p className="font-semibold text-lg">{auditSummary.total}</p>
              <p className="text-sm text-muted-foreground">
                interview{auditSummary.total !== 1 ? "s" : ""} have not passed audit
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Breakdown by category:</p>
            <div className="space-y-2">
              {Object.entries(auditSummary.categories).map(([category, count]) => (
                <div
                  key={category}
                  className="flex items-center justify-between p-3 rounded-md border bg-card"
                >
                  <div className="flex items-center gap-2">
                    {categoryIcons[category] || <AlertTriangle className="h-4 w-4" />}
                    <span className="text-sm font-medium">{category}</span>
                  </div>
                  <Badge variant="secondary" className="font-bold">
                    {count}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleAcknowledge} className="w-full">
            Acknowledged
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LoginWelcomeModal;
