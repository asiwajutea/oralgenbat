import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { AgentComparisonChart } from "./AgentComparisonChart";
import type { AgentFraudProfile } from "@/utils/fraudCalculations";
import type { WeeklyAgentTrend } from "@/hooks/useFraudDashboard";

interface Props {
  profiles: AgentFraudProfile[];
  trends: WeeklyAgentTrend[];
}

const AGENT_COLORS = ['hsl(210, 80%, 55%)', 'hsl(340, 80%, 55%)', 'hsl(140, 65%, 45%)', 'hsl(45, 90%, 50%)', 'hsl(270, 70%, 55%)'];

export const TrendsTab = ({ profiles, trends }: Props) => {
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  // Team-wide trend data
  const teamData = useMemo(() => 
    trends.map(t => ({
      week: t.week,
      'Pass Rate': Number(t.teamPassRate.toFixed(1)),
      'Volume': t.teamTotal,
      'Re-Audit Rate': Number(t.teamReAuditRate.toFixed(1)),
    })), [trends]);

  const toggleAgent = (code: string) => {
    setSelectedAgents(prev => {
      if (prev.includes(code)) return prev.filter(c => c !== code);
      if (prev.length >= 5) return prev;
      return [...prev, code];
    });
  };

  return (
    <div className="space-y-6">
      {/* Team Trends */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Team Performance Trends</CardTitle>
        </CardHeader>
        <CardContent>
          {teamData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No trend data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={teamData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="week" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="Pass Rate" stroke="hsl(142, 76%, 36%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Volume" stroke="hsl(210, 80%, 55%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Re-Audit Rate" stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Agent Comparison */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">Agent Comparison (select up to 5)</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5 mb-4 max-h-32 overflow-y-auto">
            {profiles.slice(0, 50).map(p => (
              <Badge
                key={p.interviewer_code}
                variant={selectedAgents.includes(p.interviewer_code) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => toggleAgent(p.interviewer_code)}
              >
                {p.interviewer_code}
              </Badge>
            ))}
          </div>
          
          {selectedAgents.length > 0 && (
            <AgentComparisonChart
              trends={trends}
              selectedAgents={selectedAgents}
              colors={AGENT_COLORS}
            />
          )}
          
          {selectedAgents.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Select agents above to compare their performance</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
