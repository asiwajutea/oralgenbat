import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle } from "lucide-react";

interface IntervalTimelineProps {
  closeIntervals: {
    interview1: string;
    interview2: string;
    fileName1: string;
    fileName2: string;
    minutesApart: number;
    date1: Date;
    date2: Date;
    totalNames1?: number | null;
    totalNames2?: number | null;
  }[];
  score: number;
}

export const IntervalTimeline = ({ closeIntervals, score }: IntervalTimelineProps) => {
  const getScoreColor = (score: number) => {
    if (score === 0) return 'text-green-600';
    if (score < 10) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatNameWithTotal = (fileName: string, totalNames?: number | null) => {
    const name = fileName?.replace('.pdf', '') || 'Unknown';
    if (totalNames != null) {
      return `${name} (${totalNames} names)`;
    }
    return name;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Interview Intervals Analysis
          </span>
          <Badge variant={score === 0 ? 'default' : score < 10 ? 'secondary' : 'destructive'}>
            Score: {score.toFixed(1)}/100
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className={`text-2xl font-bold ${getScoreColor(score)}`}>
            {closeIntervals.length} Suspicious Intervals
          </div>
          <p className="text-sm text-muted-foreground">
            Interviews completed less than 45 minutes apart may indicate rushed work or fraudulent data entry.
          </p>

          {closeIntervals.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Interviews</TableHead>
                    <TableHead>Time Gap</TableHead>
                    <TableHead>Severity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closeIntervals.map((interval, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm font-medium truncate max-w-[250px]" title={interval.fileName1}>
                            {formatNameWithTotal(interval.fileName1, interval.totalNames1)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(interval.date1, 'MMM d')} @ {format(interval.date1, 'HH:mm')}
                          </div>
                          <div className="text-xs text-muted-foreground">↓</div>
                          <div className="text-sm font-medium truncate max-w-[250px]" title={interval.fileName2}>
                            {formatNameWithTotal(interval.fileName2, interval.totalNames2)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(interval.date2, 'MMM d')} @ {format(interval.date2, 'HH:mm')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">
                          {interval.minutesApart.toFixed(0)} min
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={interval.minutesApart < 20 ? 'destructive' : 'secondary'}>
                          {interval.minutesApart < 20 ? 'Critical' : interval.minutesApart < 30 ? 'High' : 'Moderate'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-green-600">
              <CheckCircle className="h-12 w-12 mx-auto mb-2" />
              <p className="font-medium">No suspicious intervals detected</p>
              <p className="text-sm text-muted-foreground">All interviews have appropriate time gaps</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const CheckCircle = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);
