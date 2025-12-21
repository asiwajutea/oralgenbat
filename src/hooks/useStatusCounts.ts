import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface StatusCounts {
  Pending: number;
  "Audit Passed": number;
  "Audit Failed": number;
  "Awaiting Review": number;
  "In Progress": number;
}

export const useStatusCounts = () => {
  return useQuery({
    queryKey: ["status-counts"],
    queryFn: async (): Promise<StatusCounts> => {
      // Get all audits to count statuses
      const { data: audits, error } = await supabase
        .from("audits")
        .select("status, locked_by, locked_at");

      if (error) throw error;

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const counts: StatusCounts = {
        Pending: 0,
        "Audit Passed": 0,
        "Audit Failed": 0,
        "Awaiting Review": 0,
        "In Progress": 0,
      };

      audits?.forEach((audit) => {
        // Count as "In Progress" if locked and within 1 hour
        if (audit.locked_by && audit.locked_at && audit.locked_at > oneHourAgo) {
          counts["In Progress"]++;
        }
        
        // Always count the actual status
        if (audit.status === "Pending" || audit.status === "Awaiting Review") {
          counts["Pending"]++;
        } else if (counts[audit.status as keyof StatusCounts] !== undefined) {
          counts[audit.status as keyof StatusCounts]++;
        }
      });

      return counts;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
};
