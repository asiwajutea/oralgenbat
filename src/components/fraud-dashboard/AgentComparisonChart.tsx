import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import type { WeeklyAgentTrend } from "@/hooks/useFraudDashboard";

interface Props {
  trends: WeeklyAgentTrend[];
  selectedAgents: string[];
  colors: string[];
}

export const AgentComparisonChart = ({ trends, selectedAgents, colors }: Props) => {
  const isMobile = useIsMobile();
  
  const data = useMemo(() => 
    trends.map(t => {
      const point: Record<string, any> = { week: t.week };
      selectedAgents.forEach(code => {
        const agentData = t.agents[code];
        point[code] = agentData ? Number(agentData.passRate.toFixed(1)) : null;
      });
      return point;
    }), [trends, selectedAgents]);

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="week" className="text-xs" tick={{ fontSize: isMobile ? 10 : 12 }} />
        <YAxis className="text-xs" domain={[0, 100]} tick={{ fontSize: isMobile ? 10 : 12 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: isMobile ? 11 : 14 }} />
        {selectedAgents.map((code, i) => (
          <Line
            key={code}
            type="monotone"
            dataKey={code}
            stroke={colors[i % colors.length]}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};
