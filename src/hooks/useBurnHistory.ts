import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BurnHistoryEntry = {
  currently_burned: boolean;
  restored_at: string | null;
  last_sent_at: string;
};

/**
 * Fetches *all* burn_queue rows (including restored). Returns a Map keyed by audit_id.
 * - currently_burned: any row with restored_at IS NULL
 * - restored_at: latest restored timestamp (used for tooltip)
 * - last_sent_at: latest sent_at across rows for that audit
 */
export function useBurnHistory() {
  return useQuery({
    queryKey: ["burn-history-map"],
    queryFn: async (): Promise<Map<string, BurnHistoryEntry>> => {
      const { data } = await supabase
        .from("burn_queue")
        .select("audit_id, restored_at, sent_at");
      const map = new Map<string, BurnHistoryEntry>();
      for (const row of data || []) {
        const existing = map.get(row.audit_id);
        const sent = row.sent_at as string;
        const restored = row.restored_at as string | null;
        if (!existing) {
          map.set(row.audit_id, {
            currently_burned: restored === null,
            restored_at: restored,
            last_sent_at: sent,
          });
        } else {
          map.set(row.audit_id, {
            currently_burned: existing.currently_burned || restored === null,
            restored_at:
              restored && (!existing.restored_at || new Date(restored) > new Date(existing.restored_at))
                ? restored
                : existing.restored_at,
            last_sent_at:
              new Date(sent) > new Date(existing.last_sent_at) ? sent : existing.last_sent_at,
          });
        }
      }
      return map;
    },
    staleTime: 60_000,
  });
}