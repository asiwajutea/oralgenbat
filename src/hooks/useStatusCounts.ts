import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface StatusCounts {
  Pending: number;
  "Audit Passed": number;
  "Audit Failed": number;
  "Awaiting Review": number;
  "In Progress": number;
}

interface TotalNames {
  Pending: number;
  "Audit Passed": number;
  "Audit Failed": number;
  "Awaiting Review": number;
  "In Progress": number;
}

export const useStatusCounts = () => {
  return useQuery({
    queryKey: ["status-counts"],
    queryFn: async (): Promise<{ counts: StatusCounts; totalNames: TotalNames }> => {
      // Get all audits with their metadata for total_names
      const { data: audits, error } = await supabase
        .from("audits")
        .select(`
          status, 
          locked_by, 
          locked_at,
          interview_metadata(total_names)
        `);

      if (error) throw error;

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const counts: StatusCounts = {
        Pending: 0,
        "Audit Passed": 0,
        "Audit Failed": 0,
        "Awaiting Review": 0,
        "In Progress": 0,
      };

      const totalNames: TotalNames = {
        Pending: 0,
        "Audit Passed": 0,
        "Audit Failed": 0,
        "Awaiting Review": 0,
        "In Progress": 0,
      };

      audits?.forEach((audit) => {
        const metadata = audit.interview_metadata as { total_names: number | null }[] | null;
        const names = metadata?.[0]?.total_names || 0;
        
        // Count as "In Progress" if locked and within 1 hour
        if (audit.locked_by && audit.locked_at && audit.locked_at > oneHourAgo) {
          counts["In Progress"]++;
          totalNames["In Progress"] += names;
        }
        
        // Always count the actual status
        if (audit.status === "Pending" || audit.status === "Awaiting Review") {
          counts["Pending"]++;
          totalNames["Pending"] += names;
        } else if (counts[audit.status as keyof StatusCounts] !== undefined) {
          counts[audit.status as keyof StatusCounts]++;
          totalNames[audit.status as keyof StatusCounts] += names;
        }
      });

      return { counts, totalNames };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
};
