import { useState } from "react";
import Layout from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SummaryCard } from "@/components/analytics/SummaryCard";
import { AnalyticsFilters } from "@/components/analytics/AnalyticsFilters";
import { AuditStatusChart } from "@/components/analytics/AuditStatusChart";
import { TrendChart } from "@/components/analytics/TrendChart";
import { PerformanceBarChart } from "@/components/analytics/PerformanceBarChart";
import { AgentPerformanceTable } from "@/components/analytics/AgentPerformanceTable";
import { AuditorPerformanceTable } from "@/components/analytics/AuditorPerformanceTable";
import { ContractorPerformanceTable } from "@/components/analytics/ContractorPerformanceTable";
import { ExportButton } from "@/components/analytics/ExportButton";
import {
  useAnalyticsSummary,
  useAgentPerformance,
  useAuditorPerformance,
  useContractorPerformance,
  useTrendData,
  getDefaultFilters,
  AnalyticsFilters as FilterState,
} from "@/hooks/useAnalytics";
import { useStorageUsage } from "@/hooks/useStorageUsage";
import { StorageUsageCard } from "@/components/analytics/StorageUsageCard";
import { StorageBreakdown } from "@/components/analytics/StorageBreakdown";
import { BarChart3, Users, TrendingUp, Clock } from "lucide-react";

const AnalyticsDashboard = () => {
  const [filters, setFilters] = useState<FilterState>(getDefaultFilters());
  const [trendPeriod, setTrendPeriod] = useState<'week' | 'month'>('week');

  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary(filters);
  const { data: agentData = [], isLoading: agentLoading } = useAgentPerformance(filters);
  const { data: auditorData = [], isLoading: auditorLoading } = useAuditorPerformance(filters);
  const { data: contractorData = [], isLoading: contractorLoading } = useContractorPerformance(filters);
  const { data: trendData = [] } = useTrendData(filters, trendPeriod);
  const { data: storageUsage, isLoading: storageLoading } = useStorageUsage();

  const statusChartData = summary ? [
    { name: 'Passed', value: Math.round((summary.pass_rate / 100) * summary.total_audits), color: '#16a34a' },
    { name: 'Failed', value: Math.round(((100 - summary.pass_rate) / 100) * summary.total_audits * 0.6), color: '#dc2626' },
    { name: 'Pending', value: summary.pending_reviews, color: '#eab308' },
    { name: 'Awaiting Review', value: Math.round(((100 - summary.pass_rate) / 100) * summary.total_audits * 0.4), color: '#3b82f6' },
  ] : [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Comprehensive insights into audit performance and team metrics
            </p>
          </div>
        </div>

        {/* Filters */}
        <AnalyticsFilters filters={filters} onFiltersChange={setFilters} />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            title="Total Audits"
            value={summary?.total_audits || 0}
            trend={summary?.trend_audits}
            icon={<BarChart3 className="h-5 w-5" />}
            loading={summaryLoading}
          />
          <SummaryCard
            title="Pass Rate"
            value={summary?.pass_rate.toFixed(1) || '0.0'}
            suffix="%"
            trend={summary?.trend_pass_rate}
            icon={<TrendingUp className="h-5 w-5" />}
            loading={summaryLoading}
          />
          <SummaryCard
            title="Avg Review Time"
            value={summary?.avg_review_hours.toFixed(1) || '0.0'}
            suffix="hrs"
            trend={summary?.trend_review_time}
            icon={<Clock className="h-5 w-5" />}
            loading={summaryLoading}
          />
          <SummaryCard
            title="Active Interviewers"
            value={summary?.total_interviewers || 0}
            icon={<Users className="h-5 w-5" />}
            loading={summaryLoading}
          />
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <div className="sticky top-0 z-50 bg-background pb-4 -mx-6 px-6 pt-2">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="auditors">Auditors</TabsTrigger>
              <TabsTrigger value="contractors">Contractors</TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Storage Usage Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <StorageUsageCard data={storageUsage} loading={storageLoading} />
              </div>
              <div className="lg:col-span-2">
                <StorageBreakdown data={storageUsage} loading={storageLoading} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AuditStatusChart data={statusChartData} />
              <TrendChart data={trendData} title="Audit Trends Over Time" />
            </div>
            
            <PerformanceBarChart data={agentData} title="Top 10 Performing Agents" />
          </TabsContent>

          {/* Agents Tab */}
          <TabsContent value="agents" className="space-y-6">
            <div className="flex justify-end">
              <ExportButton data={agentData} filename="agent-performance" type="agent" />
            </div>
            <AgentPerformanceTable data={agentData} />
          </TabsContent>

          {/* Auditors Tab */}
          <TabsContent value="auditors" className="space-y-6">
            <div className="flex justify-end">
              <ExportButton data={auditorData} filename="auditor-performance" type="auditor" />
            </div>
            <AuditorPerformanceTable data={auditorData} />
          </TabsContent>

          {/* Contractors Tab */}
          <TabsContent value="contractors" className="space-y-6">
            <div className="flex justify-end">
              <ExportButton data={contractorData} filename="contractor-performance" type="contractor" />
            </div>
            <ContractorPerformanceTable data={contractorData} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default AnalyticsDashboard;
