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
import { ChecklistAnalyticsTab } from "@/components/fraud-dashboard/ChecklistAnalyticsTab";

const FraudAnalyticsDashboard = () => {
  const [period, setPeriod] = useState<TimePeriod>('13weeks');
  const { data: profiles, isLoading } = useFraudDashboard(period);
  const trendWeeks = period === '13weeks' ? 13 : period === '365days' ? 52 : 52;
  const { data: trends = [] } = useFraudDashboardTrends(profiles, trendWeeks);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Fraud Analytics</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {profiles ? `${profiles.length} agents in scope` : 'Loading...'}
            </p>
          </div>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
          <SelectTrigger className="w-36 sm:w-40">
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
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 sm:grid sm:w-full sm:grid-cols-6 lg:w-auto lg:inline-grid">
              <TabsTrigger value="overview" className="text-xs sm:text-sm px-3 sm:px-4">Overview</TabsTrigger>
              <TabsTrigger value="leaderboard" className="text-xs sm:text-sm px-3 sm:px-4">Leaderboard</TabsTrigger>
              <TabsTrigger value="fraud" className="text-xs sm:text-sm px-3 sm:px-4">Fraud Analysis</TabsTrigger>
              <TabsTrigger value="trends" className="text-xs sm:text-sm px-3 sm:px-4">Trends</TabsTrigger>
              <TabsTrigger value="audit" className="text-xs sm:text-sm px-3 sm:px-4">Audit Report</TabsTrigger>
              <TabsTrigger value="checklist" className="text-xs sm:text-sm px-3 sm:px-4">Checklist</TabsTrigger>
            </TabsList>
          </div>

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

          <TabsContent value="checklist">
            <ChecklistAnalyticsTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default FraudAnalyticsDashboard;
