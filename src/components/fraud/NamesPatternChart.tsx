import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Users, Eye } from "lucide-react";
import { AffectedInterviewsModal } from "./AffectedInterviewsModal";
import { InterviewData } from "@/hooks/useFraudAnalytics";

interface NamesPatternChartProps {
  namesPattern: number[];
  mostCommonCount: number | null;
  mostCommonFrequency: number;
  repeatedNamesCount: number;
  score: number;
  interviews?: InterviewData[];
}

export const NamesPatternChart = ({ 
  namesPattern, mostCommonCount, mostCommonFrequency, repeatedNamesCount, score, interviews = []
}: NamesPatternChartProps) => {
  const [modalOpen, setModalOpen] = useState(false);

  const frequency = namesPattern.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const chartData = Object.entries(frequency)
    .map(([names, count]) => ({ names: Number(names), count, isHighlighted: count > 3 }))
    .sort((a, b) => a.names - b.names)
    .slice(0, 20);

  const mean = namesPattern.length > 0 ? namesPattern.reduce((sum, n) => sum + n, 0) / namesPattern.length : 0;
  const variance = namesPattern.length > 0 ? namesPattern.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / namesPattern.length : 0;
  const stdDev = Math.sqrt(variance);

  // Suspicious interviews: those whose total_names appear > 3 times
  const suspiciousValues = new Set(Object.entries(frequency).filter(([, c]) => c > 3).map(([v]) => Number(v)));
  const suspiciousInterviews = interviews.filter(i => i.total_names !== null && suspiciousValues.has(i.total_names));

  const modalInterviews = suspiciousInterviews.map(i => ({
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
              <Users className="h-5 w-5" />
              Names Pattern Analysis
            </span>
            <Badge variant={score < 20 ? 'default' : score < 40 ? 'secondary' : 'destructive'}>
              Score: {score.toFixed(1)}/100
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-2xl font-bold">{mean.toFixed(0)}</div>
                <div className="text-sm text-muted-foreground">Average Names</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{stdDev.toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Std Deviation</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{repeatedNamesCount}</div>
                <div className="text-sm text-muted-foreground">Repeated Patterns</div>
              </div>
            </div>

            {mostCommonCount && (
              <div className="bg-muted p-3 rounded-md">
                <div className="text-sm font-medium">Most Common Count</div>
                <div className="text-2xl font-bold">{mostCommonCount} names</div>
                <div className="text-sm text-muted-foreground">
                  Appears {mostCommonFrequency} times
                  {mostCommonFrequency > 3 && <span className="text-orange-600 ml-2">(⚠ Suspicious)</span>}
                </div>
              </div>
            )}

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="names" label={{ value: 'Total Names', position: 'insideBottom', offset: -5 }} />
                  <YAxis label={{ value: 'Frequency', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    shape={(props: any) => {
                      const fill = props.isHighlighted ? 'hsl(var(--destructive))' : 'hsl(var(--primary))';
                      return <rect {...props} fill={fill} />;
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {suspiciousInterviews.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
                <Eye className="h-3 w-3 mr-1" /> View Suspicious Interviews ({suspiciousInterviews.length})
              </Button>
            )}

            <div className="text-sm text-muted-foreground">
              Values appearing more than 3 times are highlighted in red and considered suspicious.
              Low standard deviation (&lt;20) may indicate data fabrication.
            </div>
          </div>
        </CardContent>
      </Card>

      <AffectedInterviewsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Suspicious Name Patterns"
        interviews={modalInterviews}
        chartType="names"
      />
    </>
  );
};
