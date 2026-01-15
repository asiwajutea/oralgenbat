import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFraudAnalytics } from "@/hooks/useFraudAnalytics";
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
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { generateFraudReportPdf } from "@/utils/generateFraudReportPdf";

const AgentFraudAnalysis = () => {
  const { interviewerCode } = useParams<{ interviewerCode: string }>();
  const navigate = useNavigate();
  const [historyPage, setHistoryPage] = useState(1);
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);

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

  return (
    <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
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
              {fraudProfile.total_interviews} interviews (13 weeks)
            </div>
          </div>
          <Button 
            variant="outline"
            onClick={() => generateFraudReportPdf(fraudProfile, aiAnalysis)}
            disabled={aiLoading}
          >
            <Download className="h-4 w-4 mr-2" />
            {aiLoading ? 'Loading Analysis...' : 'Download PDF Report'}
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