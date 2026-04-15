import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, startOfWeek, subDays, subWeeks, format } from "date-fns";

interface UploadTrackingPeriod {
  period: string;
  period_start: string;
  interviews_uploaded: number;
  interviews_with_metadata: number;
  interviews_without_metadata: number;
  total_names: number;
}

interface UploadSummary {
  label: string;
  interviews: number;
  withMetadata: number;
  withoutMetadata: number;
  totalNames: number;
}

async function fetchTrackingStats(
  startDate: Date,
  endDate: Date,
  granularity: "day" | "week"
): Promise<UploadTrackingPeriod[]> {
  const { data, error } = await supabase.rpc("get_upload_tracking_stats", {
    p_start_date: startDate.toISOString(),
    p_end_date: endDate.toISOString(),
    p_granularity: granularity,
  });
  if (error) throw error;
  return (data || []) as UploadTrackingPeriod[];
}

export function useUploadTrackingSummary() {
  return useQuery({
    queryKey: ["upload-tracking-summary"],
    queryFn: async () => {
      const now = new Date();
      const todayStart = startOfDay(now);
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weeks13Start = subWeeks(now, 13);
      const year365Start = subDays(now, 365);
      const tomorrow = new Date(todayStart);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [todayData, weekData, weeks13Data, yearData] = await Promise.all([
        fetchTrackingStats(todayStart, tomorrow, "day"),
        fetchTrackingStats(weekStart, tomorrow, "day"),
        fetchTrackingStats(weeks13Start, tomorrow, "week"),
        fetchTrackingStats(year365Start, tomorrow, "week"),
      ]);

      const summarize = (data: UploadTrackingPeriod[]): Omit<UploadSummary, "label"> => ({
        interviews: data.reduce((s, d) => s + Number(d.interviews_uploaded), 0),
        withMetadata: data.reduce((s, d) => s + Number(d.interviews_with_metadata), 0),
        withoutMetadata: data.reduce((s, d) => s + Number(d.interviews_without_metadata), 0),
        totalNames: data.reduce((s, d) => s + Number(d.total_names), 0),
      });

      return {
        today: { label: "Today", ...summarize(todayData) } as UploadSummary,
        thisWeek: { label: "This Week", ...summarize(weekData) } as UploadSummary,
        last13Weeks: { label: "Last 13 Weeks", ...summarize(weeks13Data) } as UploadSummary,
        last365Days: { label: "Last 365 Days", ...summarize(yearData) } as UploadSummary,
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUploadTrackingTrend(
  startDate: Date,
  endDate: Date,
  granularity: "day" | "week"
) {
  return useQuery({
    queryKey: [
      "upload-tracking-trend",
      format(startDate, "yyyy-MM-dd"),
      format(endDate, "yyyy-MM-dd"),
      granularity,
    ],
    queryFn: () => fetchTrackingStats(startDate, endDate, granularity),
    staleTime: 1000 * 60 * 5,
  });
}
