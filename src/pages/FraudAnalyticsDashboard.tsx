import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert } from "lucide-react";
import { useFraudDashboard, useFraudDashboardTrends, type TimePeriod } from "@/hooks/useFraudDashboard";
import { OverviewTab } from "@/components/fraud-dashboard/OverviewTab";
import { LeaderboardTab } from "@/components/fraud-dashboard/LeaderboardTab";
import { FraudBreakdownTab } from "@/components/fraud-dashboard/FraudBreakdownTab";
import { TrendsTab } from "@/components/fraud-dashboard/TrendsTab";
import { AuditReportTab } from "@/components/fraud-dashboard/AuditReportTab";

const periodLabels: Record<TimePeriod, string> = {
  '13weeks': '13 Weeks',
  '365days': '365 Days',
  'lifetime': 'Lifetime',
};

const FraudAnalyticsDashboard = () => {
  const [period, setPeriod] = useState<TimePeriod>('13weeks');
  const { data: profiles, isLoading } = useFraudDashboard(period);
  const trendWeeks = period === '13weeks' ? 13 : period === '365days' ? 52 : 52;
  const { data: trends = [] } = useFraudDashboardTrends(profiles, trendWeeks);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Fraud Analytics</h1>
            <p className="text-sm text-muted-foreground">
              {profiles ? `${profiles.length} agents in scope` : 'Loading...'}
            </p>
          </div>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="13weeks">13 Weeks</SelectItem>
            <SelectItem value="365days">365 Days</SelectItem>
            <SelectItem value="lifetime">Lifetime</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="fraud">Fraud Analysis</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="audit">Audit Report</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab profiles={profiles || []} />
          </TabsContent>

          <TabsContent value="leaderboard">
            <LeaderboardTab profiles={profiles || []} />
          </TabsContent>

          <TabsContent value="fraud">
            <FraudBreakdownTab profiles={profiles || []} />
          </TabsContent>

          <TabsContent value="trends">
            <TrendsTab profiles={profiles || []} trends={trends} />
          </TabsContent>

          <TabsContent value="audit">
            <AuditReportTab profiles={profiles || []} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default FraudAnalyticsDashboard;
