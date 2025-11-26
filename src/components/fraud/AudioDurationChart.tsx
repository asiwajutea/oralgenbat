import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { Music } from "lucide-react";

interface AudioDurationChartProps {
  shortFamilyStories: { interviewId: string; duration: number; date: Date }[];
  shortPedigrees: { interviewId: string; duration: number; date: Date }[];
  score: number;
}

export const AudioDurationChart = ({ shortFamilyStories, shortPedigrees, score }: AudioDurationChartProps) => {
  const chartData = [
    {
      type: 'Family Story',
      flagged: shortFamilyStories.length,
      threshold: 600,
      label: '< 10 min',
    },
    {
      type: 'Pedigree',
      flagged: shortPedigrees.length,
      threshold: 900,
      label: '< 15 min',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Audio Duration Analysis
          </span>
          <Badge variant={score === 0 ? 'default' : score < 20 ? 'secondary' : 'destructive'}>
            Score: {score.toFixed(1)}/100
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold text-red-600">{shortFamilyStories.length}</div>
              <div className="text-sm text-muted-foreground">Short Family Stories</div>
              <div className="text-xs text-muted-foreground">(&lt; 10 minutes)</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{shortPedigrees.length}</div>
              <div className="text-sm text-muted-foreground">Short Pedigrees</div>
              <div className="text-xs text-muted-foreground">(&lt; 15 minutes)</div>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis label={{ value: 'Flagged Count', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Bar dataKey="flagged" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="text-sm text-muted-foreground">
            <p><strong>Expected durations:</strong></p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Family Story: ≥ 10 minutes (ideal: 15 minutes)</li>
              <li>Pedigree Segment: ≥ 15 minutes</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};