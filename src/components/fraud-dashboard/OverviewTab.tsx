import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, AlertTriangle, TrendingUp, BarChart3, ShieldAlert } from "lucide-react";
import type { AgentFraudProfile } from "@/utils/fraudCalculations";
import { FraudGradeDistribution } from "./FraudGradeDistribution";
import { FraudHeatmap } from "./FraudHeatmap";

interface OverviewTabProps {
  profiles: AgentFraudProfile[];
}

export const OverviewTab = ({ profiles }: OverviewTabProps) => {
  const totalAgents = profiles.length;
  const avgFraudScore = totalAgents > 0 
    ? profiles.reduce((s, p) => s + p.overallFraudScore, 0) / totalAgents 
    : 0;
  const atRisk = profiles.filter(p => p.fraudGrade === 'C' || p.fraudGrade === 'D').length;
  const totalInterviews = profiles.reduce((s, p) => s + p.total_interviews, 0);
  const totalPassed = profiles.reduce((s, p) => s + p.passedCount, 0);
  const totalFailed = profiles.reduce((s, p) => s + p.failedCount, 0);
  const totalReviewed = totalPassed + totalFailed;
  const teamPassRate = totalReviewed > 0 ? (totalPassed / totalReviewed) * 100 : 0;
  const totalPending = profiles.reduce((s, p) => s + p.pendingCount, 0);
  const totalReAudit = profiles.reduce((s, p) => s + p.reAuditCount, 0);

  const gradeDistribution = {
    A: profiles.filter(p => p.fraudGrade === 'A').length,
    B: profiles.filter(p => p.fraudGrade === 'B').length,
    C: profiles.filter(p => p.fraudGrade === 'C').length,
    D: profiles.filter(p => p.fraudGrade === 'D').length,
  };

  const cards = [
    { label: 'Total Agents', value: totalAgents, icon: Users, color: 'text-primary' },
    { label: 'Avg Fraud Score', value: avgFraudScore.toFixed(1), icon: ShieldAlert, color: avgFraudScore > 40 ? 'text-destructive' : 'text-primary' },
    { label: 'Agents at Risk', value: atRisk, icon: AlertTriangle, color: atRisk > 0 ? 'text-destructive' : 'text-muted-foreground' },
    { label: 'Team Pass Rate', value: `${teamPassRate.toFixed(1)}%`, icon: TrendingUp, color: 'text-primary' },
    { label: 'Total Interviews', value: totalInterviews, icon: BarChart3, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map(c => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <c.icon className={`h-4 w-4 ${c.color}`} />
                <span className="text-xs text-muted-foreground">{c.label}</span>
              </div>
              <p className="text-2xl font-bold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Audit Status Breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Passed</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{totalPassed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Failed</p>
            <p className="text-xl font-bold text-destructive">{totalFailed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Pending</p>
            <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{totalPending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Re-Audit</p>
            <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{totalReAudit}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        <FraudGradeDistribution distribution={gradeDistribution} />
        <FraudHeatmap profiles={profiles} />
      </div>
    </div>
  );
};
