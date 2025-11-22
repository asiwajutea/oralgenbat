import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendData } from "@/hooks/useAnalytics";

interface TrendChartProps {
  data: TrendData[];
  title: string;
}

export const TrendChart = ({ data, title }: TrendChartProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="period"
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="passed"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth={2}
              name="Passed"
            />
            <Line
              type="monotone"
              dataKey="failed"
              stroke="hsl(0, 84%, 60%)"
              strokeWidth={2}
              name="Failed"
            />
            <Line
              type="monotone"
              dataKey="pending"
              stroke="hsl(48, 96%, 53%)"
              strokeWidth={2}
              name="Pending"
            />
            <Line
              type="monotone"
              dataKey="awaiting_review"
              stroke="hsl(221, 83%, 53%)"
              strokeWidth={2}
              name="Awaiting Review"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
