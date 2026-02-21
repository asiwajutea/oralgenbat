import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, ListChecks, TrendingUp, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import {
  useChecklistQuestionStats,
  useChecklistAgentRanking,
  useChecklistSummary,
  useChecklistScope,
  type ChecklistPeriod,
} from "@/hooks/useChecklistAnalytics";

const CATEGORY_COLORS: Record<string, string> = {
  'A': 'hsl(var(--primary))',
  'B': 'hsl(var(--chart-2))',
  'C': 'hsl(var(--chart-3))',
};

export const ChecklistAnalyticsTab = () => {
  const [period, setPeriod] = useState<ChecklistPeriod>('13weeks');
  const scope = useChecklistScope();

  const { data: summary, isLoading: summaryLoading } = useChecklistSummary(period, scope);
  const { data: questionStats, isLoading: questionsLoading } = useChecklistQuestionStats(period, scope);
  const { data: agentRanking, isLoading: agentsLoading } = useChecklistAgentRanking(period, scope);

  const isLoading = summaryLoading || questionsLoading || agentsLoading;

  // Build category chart data
  const categoryData = (() => {
    if (!questionStats || questionStats.length === 0) return [];
    const catMap = new Map<string, { passed: number; failed: number }>();
    questionStats.forEach(q => {
      if (!catMap.has(q.category)) catMap.set(q.category, { passed: 0, failed: 0 });
      const c = catMap.get(q.category)!;
      c.passed += q.passedCount;
      c.failed += q.failedCount;
    });
    return Array.from(catMap.entries()).map(([cat, stats]) => ({
      category: `Group ${cat}`,
      Passed: stats.passed,
      Failed: stats.failed,
    }));
  })();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Filter */}
      <div className="flex justify-end">
        <Select value={period} onValueChange={(v) => setPeriod(v as ChecklistPeriod)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1week">1 Week</SelectItem>
            <SelectItem value="13weeks">13 Weeks</SelectItem>
            <SelectItem value="1year">1 Year</SelectItem>
            <SelectItem value="lifetime">Lifetime</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <ListChecks className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-2xl font-bold">{summary.totalQuestions.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Questions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{summary.totalPassed.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Passed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <XCircle className="h-6 w-6 text-red-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{summary.totalFailed.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{summary.passPercentage}%</p>
            <p className="text-xs text-muted-foreground">Pass Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Category Bar Chart */}
      {categoryData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pass/Fail by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Passed" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Failed" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Question Performance Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Question Performance (Ranked by Failures)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {questionStats.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No checklist data for this period.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead className="text-center w-16">Cat</TableHead>
                    <TableHead className="text-center w-20">Pass</TableHead>
                    <TableHead className="text-center w-20">Fail</TableHead>
                    <TableHead className="w-32">Pass Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {questionStats.map((q, idx) => (
                    <TableRow key={q.id}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{q.question}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">{q.category}</Badge>
                      </TableCell>
                      <TableCell className="text-center text-green-600 font-medium">{q.passedCount}</TableCell>
                      <TableCell className="text-center text-red-600 font-medium">{q.failedCount}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={q.passRate} className="h-2 flex-1" />
                          <span className="text-xs font-medium w-10 text-right">{q.passRate}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent Ranking Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Agent Checklist Ranking (Lowest Pass Rate First)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agentRanking.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No agent data for this period.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Agent Code</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Pass</TableHead>
                    <TableHead className="text-center">Fail</TableHead>
                    <TableHead className="w-32">Pass %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentRanking.map((agent, idx) => (
                    <TableRow key={agent.interviewer_code}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium">{agent.interviewer_code}</TableCell>
                      <TableCell className="text-center">{agent.totalQuestions}</TableCell>
                      <TableCell className="text-center text-green-600">{agent.passed}</TableCell>
                      <TableCell className="text-center text-red-600">{agent.failed}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={agent.passPercentage} className="h-2 flex-1" />
                          <Badge variant={agent.passPercentage >= 80 ? "default" : agent.passPercentage >= 60 ? "secondary" : "destructive"} className="text-xs w-12 justify-center">
                            {agent.passPercentage}%
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
