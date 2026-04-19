import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFraudAnalytics, TimePeriod, getPeriodLabel } from "@/hooks/useFraudAnalytics";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";
import { AuditPagination } from "@/components/AuditPagination";
import { FraudGradeBadge } from "@/components/fraud/FraudGradeBadge";
import { FraudSummaryCard } from "@/components/fraud/FraudSummaryCard";
import { ActionPlanCard } from "@/components/fraud/ActionPlanCard";
import { IntervalTimeline } from "@/components/fraud/IntervalTimeline";
import { AudioDurationChart } from "@/components/fraud/AudioDurationChart";
import { NamesPatternChart } from "@/components/fraud/NamesPatternChart";
import { PageBoundaryChart } from "@/components/fraud/PageBoundaryChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfWeek } from "date-fns";
import { Loader2 } from "lucide-react";
import { generateFraudReportPdf } from "@/utils/generateFraudReportPdf";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { useAiSettings } from "@/hooks/useAiSettings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles } from "lucide-react";

const COLORS = ['#22c55e', '#ef4444', '#f97316', '#3b82f6'];

const AgentFraudAnalysis = () => {
  const { interviewerCode } = useParams<{ interviewerCode: string }>();
  const navigate = useNavigate();
  const [historyPage, setHistoryPage] = useState(1);
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);
  const [period, setPeriod] = useState<TimePeriod>('13weeks');

  const { data: fraudProfile, isLoading: profileLoading } = useFraudAnalytics(interviewerCode!, period);
  const { data: aiSettings } = useAiSettings();
  const fraudAiEnabled = aiSettings?.fraud_analysis_enabled !== false;

  const { data: aiAnalysis, isLoading: aiLoading } = useQuery({
    queryKey: ['fraud-ai-analysis', interviewerCode, period],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fraud-analysis', {
        body: {
          fraudProfile,
          comparisonStats: { avgPassRate: 75, avgReAuditRate: 15 },
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!fraudProfile && fraudAiEnabled,
  });

  // Pass/Fail distribution data
  const statusDistribution = fraudProfile ? (() => {
    const passed = fraudProfile.interviews.filter(i => i.status === 'Audit Passed').length;
    const failed = fraudProfile.interviews.filter(i => i.status === 'Audit Failed').length;
    const awaiting = fraudProfile.interviews.filter(i => i.status === 'Awaiting Review').length;
    const pending = fraudProfile.interviews.filter(i => i.status === 'Pending').length;
    return [
      { name: 'Passed', value: passed },
      { name: 'Failed', value: failed },
      { name: 'Awaiting', value: awaiting },
      { name: 'Pending', value: pending },
    ].filter(d => d.value > 0);
  })() : [];

  // Interview volume per week
  const volumeData = fraudProfile ? (() => {
    const weekMap = new Map<string, number>();
    fraudProfile.interviews.forEach(i => {
      const week = format(startOfWeek(i.timestamp, { weekStartsOn: 1 }), 'MMM d');
      weekMap.set(week, (weekMap.get(week) || 0) + 1);
    });
    const entries = Array.from(weekMap.entries()).map(([week, count]) => ({ week, count }));
    // Sort chronologically
    return entries;
  })() : [];

  const avgVolume = volumeData.length > 0 ? volumeData.reduce((s, d) => s + d.count, 0) / volumeData.length : 0;

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!fraudProfile) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Agent Not Found</h2>
          <Button onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  const periodLabel = getPeriodLabel(period);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">Fraud Analysis Report</h1>
          <div className="text-muted-foreground mt-1">
            Agent: {fraudProfile.interviewer_code}
            {fraudProfile.interviewer_name && ` (${fraudProfile.interviewer_name})`}
            <span className="mx-2">•</span>
            Contractor: {fraudProfile.contractor_id}
            <span className="mx-2">•</span>
            {fraudProfile.total_interviews} interviews ({periodLabel})
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="13weeks">13 Weeks</SelectItem>
              <SelectItem value="365days">365 Days</SelectItem>
              <SelectItem value="lifetime">Lifetime</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => generateFraudReportPdf(fraudProfile, aiAnalysis)}
            disabled={aiLoading}
          >
            <Download className="h-4 w-4 mr-2" />
            {aiLoading ? 'Loading...' : 'Download PDF'}
          </Button>
        </div>
      </div>

      {/* Fraud Grade Badge */}
      <FraudGradeBadge
        grade={fraudProfile.fraudGrade}
        classification={fraudProfile.classification}
        score={fraudProfile.overallFraudScore}
      />

      {/* AI Summary - only when fraud AI is enabled */}
      {fraudAiEnabled ? (
        <>
          <FraudSummaryCard
            summary={aiAnalysis?.summary || null}
            concerningPatterns={aiAnalysis?.concerningPatterns || []}
            isLoading={aiLoading}
          />

          {/* Action Plan */}
          {aiAnalysis?.actionPlan && (
            <ActionPlanCard actionPlan={aiAnalysis.actionPlan} />
          )}
        </>
      ) : (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            AI narrative is disabled by an administrator. Fraud indicators and charts below are still active.
          </AlertDescription>
        </Alert>
      )}

      {/* Fraud Indicators Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        <IntervalTimeline
          closeIntervals={fraudProfile.indicators.closeIntervals}
          score={fraudProfile.indicators.intervalFraudScore}
        />

        <AudioDurationChart
          shortFamilyStories={fraudProfile.indicators.shortFamilyStories}
          shortPedigrees={fraudProfile.indicators.shortPedigrees}
          score={fraudProfile.indicators.audioDurationFraudScore}
          interviews={fraudProfile.interviews}
        />

        <NamesPatternChart
          namesPattern={fraudProfile.indicators.namesPattern}
          mostCommonCount={fraudProfile.indicators.mostCommonCount}
          mostCommonFrequency={fraudProfile.indicators.mostCommonFrequency}
          repeatedNamesCount={fraudProfile.indicators.repeatedNamesCount}
          score={fraudProfile.indicators.namesPatternFraudScore}
          interviews={fraudProfile.interviews}
        />

        <PageBoundaryChart
          boundaryHits={fraudProfile.indicators.boundaryHits}
          totalInterviews={fraudProfile.indicators.totalInterviews}
          expectedBoundaryRate={fraudProfile.indicators.expectedBoundaryRate}
          actualBoundaryRate={fraudProfile.indicators.actualBoundaryRate}
          neverHitsBoundaries={fraudProfile.indicators.neverHitsBoundaries}
          alwaysHitsBoundaries={fraudProfile.indicators.alwaysHitsBoundaries}
          score={fraudProfile.indicators.pageBoundaryFraudScore}
          namesPattern={fraudProfile.indicators.namesPattern}
          interviews={fraudProfile.interviews}
        />
      </div>

      {/* Additional Visual Analysis */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Pass/Fail Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Audit Outcome Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {statusDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Pass rate: {fraudProfile.indicators.passRate.toFixed(1)}% (expected: ~75%)
            </p>
          </CardContent>
        </Card>

        {/* Interview Volume Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Interview Volume by Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Average: {avgVolume.toFixed(1)} interviews/week
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Interview History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Interview History ({periodLabel})</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const totalHistoryPages = Math.ceil(fraudProfile.interviews.length / historyItemsPerPage);
            const paginatedInterviews = fraudProfile.interviews.slice(
              (historyPage - 1) * historyItemsPerPage,
              historyPage * historyItemsPerPage
            );

            return (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">SN</TableHead>
                        <TableHead>Interview ID</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead className="text-right">Total Names</TableHead>
                        <TableHead className="text-right">Family Duration</TableHead>
                        <TableHead className="text-right">Pedigree Duration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedInterviews.map((interview, index) => {
                        const isFlagged =
                          fraudProfile.indicators.closeIntervals.some(
                            ci => ci.interview1 === interview.id || ci.interview2 === interview.id
                          ) ||
                          fraudProfile.indicators.shortFamilyStories.some(sf => sf.interviewId === interview.id) ||
                          fraudProfile.indicators.shortPedigrees.some(sp => sp.interviewId === interview.id);

                        return (
                          <TableRow key={interview.id} className={isFlagged ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                            <TableCell className="font-medium">
                              {(historyPage - 1) * historyItemsPerPage + index + 1}
                            </TableCell>
                            <TableCell className="font-medium text-sm truncate max-w-[200px]" title={interview.file_name}>
                              {interview.file_name?.replace('.pdf', '') || '-'}
                            </TableCell>
                            <TableCell>{format(interview.timestamp, 'MMM d, yyyy')}</TableCell>
                            <TableCell>{interview.interview_time}</TableCell>
                            <TableCell className="text-right font-medium">
                              {interview.total_names || '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {interview.family_story_duration
                                ? `${(interview.family_story_duration / 60).toFixed(1)} min`
                                : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {interview.pedigree_segment_duration
                                ? `${(interview.pedigree_segment_duration / 60).toFixed(1)} min`
                                : '-'}
                            </TableCell>
                            <TableCell>{interview.status}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <AuditPagination
                  currentPage={historyPage}
                  totalPages={totalHistoryPages}
                  totalCount={fraudProfile.interviews.length}
                  itemsPerPage={historyItemsPerPage}
                  onPageChange={setHistoryPage}
                  onItemsPerPageChange={(newSize) => {
                    setHistoryItemsPerPage(newSize);
                    setHistoryPage(1);
                  }}
                />
              </>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentFraudAnalysis;
