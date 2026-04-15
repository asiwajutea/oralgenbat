import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface StatusCounts {
  Pending: number;
  "Audit Passed": number;
  "Audit Failed": number;
  "Awaiting Review": number;
  "In Progress": number;
  "Re-Audit": number;
  "Ready for Review": number;
}

interface TotalNames {
  Pending: number;
  "Audit Passed": number;
  "Audit Failed": number;
  "Awaiting Review": number;
  "In Progress": number;
  "Re-Audit": number;
  "Ready for Review": number;
}

export const useStatusCounts = () => {
  const { userRole, profile } = useAuth();
  const isAuditor = userRole === 'auditor';
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  const effectiveContractorId = isAuditor
    ? profile?.active_contractor_id
    : (profile?.active_contractor_id || profile?.contractor_id);

  return useQuery({
    queryKey: ["status-counts", userRole, profile?.full_name, effectiveContractorId],
    queryFn: async (): Promise<{ counts: StatusCounts; totalNames: TotalNames }> => {
      // Use server-side RPC for efficient aggregation
      const { data, error } = await supabase.rpc("get_status_counts", {
        p_contractor_id: (isAdmin ? null : effectiveContractorId) || null,
        p_auditor_name: isAuditor ? (profile?.full_name || null) : null,
        p_is_auditor: isAuditor,
      });

      if (error) throw error;

      const counts: StatusCounts = {
        Pending: 0,
        "Audit Passed": 0,
        "Audit Failed": 0,
        "Awaiting Review": 0,
        "In Progress": 0,
        "Re-Audit": 0,
        "Ready for Review": 0,
      };

      const totalNames: TotalNames = {
        Pending: 0,
        "Audit Passed": 0,
        "Audit Failed": 0,
        "Awaiting Review": 0,
        "In Progress": 0,
        "Re-Audit": 0,
        "Ready for Review": 0,
      };

      (data || []).forEach((row: { status_key: string; count: number; total_names: number }) => {
        const key = row.status_key as keyof StatusCounts;
        if (counts[key] !== undefined) {
          counts[key] = Number(row.count);
          totalNames[key] = Number(row.total_names);
        }
      });

      return { counts, totalNames };
    },
  });
};
