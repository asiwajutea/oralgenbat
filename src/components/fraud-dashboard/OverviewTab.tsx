import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, AlertTriangle, TrendingUp, BarChart3, ShieldAlert, Target, CheckCircle2, ShieldCheck, ShieldX, Flame } from "lucide-react";
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

      {/* Fraud Score Interpretation Guide */}
      <Card className="border-2 border-dashed border-muted-foreground/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Understanding Fraud Scores</CardTitle>
          </div>
          <CardDescription>
            The fraud score (0–100) measures how likely an agent's work patterns indicate irregularities. A <strong>lower score is better</strong>. Leaders should aim for all agents to maintain Grade A or B.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Grade A */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <ShieldCheck className="h-6 w-6 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Grade A · Safe</p>
                <p className="text-xs text-muted-foreground font-medium">Score: 0–25</p>
                <p className="text-xs text-muted-foreground mt-1">No concerns. Agent follows proper interview procedures consistently. <strong>This is the target for all agents.</strong></p>
              </div>
            </div>
            {/* Grade B */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <CheckCircle2 className="h-6 w-6 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Grade B · Caution</p>
                <p className="text-xs text-muted-foreground font-medium">Score: 26–50</p>
                <p className="text-xs text-muted-foreground mt-1">Minor irregularities detected. Monitor closely and provide coaching to improve interview quality.</p>
              </div>
            </div>
            {/* Grade C */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <ShieldX className="h-6 w-6 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Grade C · High Risk</p>
                <p className="text-xs text-muted-foreground font-medium">Score: 51–75</p>
                <p className="text-xs text-muted-foreground mt-1">Significant red flags in interview patterns. Requires immediate investigation and field supervision.</p>
              </div>
            </div>
            {/* Grade D */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <Flame className="h-6 w-6 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Grade D · Critical</p>
                <p className="text-xs text-muted-foreground font-medium">Score: 76–100</p>
                <p className="text-xs text-muted-foreground mt-1">Strong evidence of fraudulent activity. Recommend suspension pending full review. Escalate immediately.</p>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground text-sm mb-1">🎯 Leadership Goals</p>
            <p>• <strong>Team target:</strong> 80%+ of agents at Grade A, 0 agents at Grade C or D</p>
            <p>• <strong>Key drivers:</strong> Interview spacing (&gt;45 min apart), proper audio durations (Family Story ≥10 min, Pedigree ≥15 min), consistent name counts, and high audit pass rates</p>
            <p>• <strong>Action:</strong> Review Grade C/D agents weekly. Pair them with top-performing agents for field mentorship</p>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        <FraudGradeDistribution distribution={gradeDistribution} />
        <FraudHeatmap profiles={profiles} />
      </div>
    </div>
  );
};
