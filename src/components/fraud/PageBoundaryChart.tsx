import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { FileText, AlertTriangle, Eye } from "lucide-react";
import { AffectedInterviewsModal } from "./AffectedInterviewsModal";
import { InterviewData } from "@/hooks/useFraudAnalytics";

const PAGE_BOUNDARIES = [24, 50, 76, 102, 128, 154, 180, 206, 232, 258];

interface PageBoundaryChartProps {
  boundaryHits: number;
  totalInterviews: number;
  expectedBoundaryRate: number;
  actualBoundaryRate: number;
  neverHitsBoundaries: boolean;
  alwaysHitsBoundaries: boolean;
  score: number;
  namesPattern: number[];
  interviews?: InterviewData[];
}

export const PageBoundaryChart = ({
  boundaryHits, totalInterviews, expectedBoundaryRate, actualBoundaryRate,
  neverHitsBoundaries, alwaysHitsBoundaries, score, namesPattern, interviews = [],
}: PageBoundaryChartProps) => {
  const [modalOpen, setModalOpen] = useState(false);

  const boundaryData = PAGE_BOUNDARIES.map(boundary => ({
    boundary: boundary.toString(),
    hits: namesPattern.filter(n => n === boundary).length,
  }));

  const chartData = [
    { category: 'Expected Rate', rate: expectedBoundaryRate },
    { category: 'Actual Rate', rate: actualBoundaryRate },
  ];

  // Interviews that hit boundaries
  const boundaryInterviews = interviews
    .filter(i => i.total_names !== null && PAGE_BOUNDARIES.includes(i.total_names))
    .map(i => ({
      id: i.id,
      file_name: i.file_name,
      date: i.timestamp,
      value: i.total_names || 0,
      status: i.status,
    }));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Page Boundary Analysis
            </span>
            <Badge variant={score < 20 ? 'default' : score < 50 ? 'secondary' : 'destructive'}>
              Score: {score.toFixed(1)}/100
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-bold">{boundaryHits}/{totalInterviews}</div>
                <div className="text-sm text-muted-foreground">Boundary Hits</div>
              </div>
              <div>
                <div className={`text-2xl font-bold ${actualBoundaryRate > expectedBoundaryRate + 10 ? 'text-red-600' : 'text-green-600'}`}>
                  {actualBoundaryRate.toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">Actual Rate (Expected: {expectedBoundaryRate}%)</div>
              </div>
            </div>

            {(neverHitsBoundaries || alwaysHitsBoundaries) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {alwaysHitsBoundaries && (
                    <div><strong>CRITICAL:</strong> Agent consistently ends interviews at exact page boundaries.</div>
                  )}
                  {neverHitsBoundaries && (
                    <div><strong>WARNING:</strong> Agent never hits page boundaries across {totalInterviews} interviews.</div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <div>
              <h4 className="text-sm font-medium mb-2">Page Boundaries (24, 50, 76, 102...)</h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={boundaryData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="boundary" label={{ value: 'Page Boundary', position: 'insideBottom', offset: -5 }} />
                    <YAxis label={{ value: 'Hits', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Bar dataKey="hits" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Rate Comparison</h4>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" label={{ value: 'Rate (%)', position: 'insideBottom', offset: -5 }} />
                    <YAxis type="category" dataKey="category" width={100} />
                    <Tooltip />
                    <Bar dataKey="rate" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {boundaryInterviews.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
                <Eye className="h-3 w-3 mr-1" /> View Boundary Hits ({boundaryInterviews.length})
              </Button>
            )}

            <div className="text-sm text-muted-foreground">
              <p><strong>Page boundaries:</strong> 24, 50, 76, 102, 128, 154... (+26 per page)</p>
              <p className="mt-1">Expected rate: ~3.8% (1 in 26 chance). Significant deviation indicates fraud.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <AffectedInterviewsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Page Boundary Hits"
        interviews={boundaryInterviews}
        chartType="boundary"
      />
    </>
  );
};
