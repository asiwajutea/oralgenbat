import { useParams, useNavigate } from "react-router-dom";
import { useFraudAnalytics } from "@/hooks/useFraudAnalytics";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";
import { FraudGradeBadge } from "@/components/fraud/FraudGradeBadge";
import { FraudSummaryCard } from "@/components/fraud/FraudSummaryCard";
import { ActionPlanCard } from "@/components/fraud/ActionPlanCard";
import { IntervalTimeline } from "@/components/fraud/IntervalTimeline";
import { AudioDurationChart } from "@/components/fraud/AudioDurationChart";
import { NamesPatternChart } from "@/components/fraud/NamesPatternChart";
import { PageBoundaryChart } from "@/components/fraud/PageBoundaryChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

const AgentFraudAnalysis = () => {
  const { interviewerCode } = useParams<{ interviewerCode: string }>();
  const navigate = useNavigate();

  const { data: fraudProfile, isLoading: profileLoading } = useFraudAnalytics(interviewerCode!);

  // Fetch AI analysis
  const { data: aiAnalysis, isLoading: aiLoading } = useQuery({
    queryKey: ['fraud-ai-analysis', interviewerCode],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fraud-analysis', {
        body: {
          fraudProfile,
          comparisonStats: {
            avgPassRate: 75,
            avgReAuditRate: 15,
          },
        },
      });

      if (error) throw error;
      return data;
    },
    enabled: !!fraudProfile,
  });

  if (profileLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!fraudProfile) {
    return (
      <Layout>
        <div className="container mx-auto p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Agent Not Found</h2>
            <Button onClick={() => navigate('/analytics')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Analytics
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" onClick={() => navigate('/analytics')} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Analytics
            </Button>
            <h1 className="text-3xl font-bold">Fraud Analysis Report</h1>
            <div className="text-muted-foreground mt-1">
              Agent: {fraudProfile.interviewer_code} 
              {fraudProfile.interviewer_name && ` (${fraudProfile.interviewer_name})`}
              <span className="mx-2">•</span>
              Contractor: {fraudProfile.contractor_id}
              <span className="mx-2">•</span>
              {fraudProfile.total_interviews} interviews (13 weeks)
            </div>
          </div>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>

        {/* Fraud Grade Badge */}
        <FraudGradeBadge
          grade={fraudProfile.fraudGrade}
          classification={fraudProfile.classification}
          score={fraudProfile.overallFraudScore}
        />

        {/* AI Summary */}
        <FraudSummaryCard
          summary={aiAnalysis?.summary || null}
          concerningPatterns={aiAnalysis?.concerningPatterns || []}
          isLoading={aiLoading}
        />

        {/* Action Plan */}
        {aiAnalysis?.actionPlan && (
          <ActionPlanCard actionPlan={aiAnalysis.actionPlan} />
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
          />

          <NamesPatternChart
            namesPattern={fraudProfile.indicators.namesPattern}
            mostCommonCount={fraudProfile.indicators.mostCommonCount}
            mostCommonFrequency={fraudProfile.indicators.mostCommonFrequency}
            repeatedNamesCount={fraudProfile.indicators.repeatedNamesCount}
            score={fraudProfile.indicators.namesPatternFraudScore}
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
          />
        </div>

        {/* Interview History Table */}
        <Card>
          <CardHeader>
            <CardTitle>Interview History (13 weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="text-right">Total Names</TableHead>
                    <TableHead className="text-right">Family Duration</TableHead>
                    <TableHead className="text-right">Pedigree Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fraudProfile.interviews.map((interview) => {
                    const isFlagged = 
                      fraudProfile.indicators.closeIntervals.some(
                        ci => ci.interview1 === interview.id || ci.interview2 === interview.id
                      ) ||
                      fraudProfile.indicators.shortFamilyStories.some(sf => sf.interviewId === interview.id) ||
                      fraudProfile.indicators.shortPedigrees.some(sp => sp.interviewId === interview.id);

                    return (
                      <TableRow key={interview.id} className={isFlagged ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                        <TableCell>{format(interview.timestamp, 'MMM d, yyyy')}</TableCell>
                        <TableCell>{interview.interview_time}</TableCell>
                        <TableCell className="text-right font-medium">
                          {interview.total_names || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {interview.family_story_duration 
                            ? `${(interview.family_story_duration / 60).toFixed(1)} min`
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          {interview.pedigree_segment_duration
                            ? `${(interview.pedigree_segment_duration / 60).toFixed(1)} min`
                            : '-'
                          }
                        </TableCell>
                        <TableCell>{interview.status}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default AgentFraudAnalysis;