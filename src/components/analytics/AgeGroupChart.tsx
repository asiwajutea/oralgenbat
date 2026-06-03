import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AgeBucket {
  bucket: string;
  bucket_order: number;
  count: number;
}

// Colors pulled from the design system's chart palette
const BUCKET_COLORS: Record<string, string> = {
  "Under 40": "hsl(var(--chart-1, 217 91% 60%))",
  "40-54": "hsl(var(--chart-2, 173 80% 40%))",
  "55-64": "hsl(var(--chart-3, 142 71% 45%))",
  "65-74": "hsl(var(--chart-4, 38 92% 50%))",
  "75-84": "hsl(var(--chart-5, 25 95% 53%))",
  "85+": "hsl(var(--destructive))",
  Unknown: "hsl(var(--muted-foreground))",
};

export const AgeGroupChart = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["interview-age-distribution"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_interview_age_distribution" as any,
        { _contractor_ids: null, _interviewer_codes: null },
      );
      if (error) throw error;
      return (data || []) as AgeBucket[];
    },
    staleTime: 5 * 60_000,
  });

  const rows = (data || [])
    .slice()
    .sort((a, b) => a.bucket_order - b.bucket_order)
    .map((r) => ({ ...r, count: Number(r.count) }));
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  const chartData = rows.map((r) => ({
    ...r,
    pct: total > 0 ? (r.count / total) * 100 : 0,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Interviewee Age Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[320px] w-full" />
        ) : total === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            No interview records with age data yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={chartData}
              margin={{ top: 24, right: 16, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="bucket"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number, _name, entry: any) => [
                  `${value.toLocaleString()} (${entry.payload.pct.toFixed(1)}%)`,
                  "Interviews",
                ]}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} animationDuration={700}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.bucket}
                    fill={BUCKET_COLORS[entry.bucket] || "hsl(var(--primary))"}
                  />
                ))}
                <LabelList
                  dataKey="count"
                  position="top"
                  className="fill-foreground"
                  style={{ fontSize: 11, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        {total > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              Total: {total.toLocaleString()}
            </span>
            {chartData.map((r) => (
              <span key={r.bucket} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: BUCKET_COLORS[r.bucket] }}
                />
                {r.bucket}: {r.count.toLocaleString()} ({r.pct.toFixed(1)}%)
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AgeGroupChart;