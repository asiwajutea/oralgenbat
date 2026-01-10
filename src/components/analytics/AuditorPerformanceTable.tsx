import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AuditorPerformance } from "@/hooks/useAnalytics";

interface AuditorPerformanceTableProps {
  data: AuditorPerformance[];
}

export const AuditorPerformanceTable = ({ data }: AuditorPerformanceTableProps) => {
  const getEfficiencyBadge = (rating: string) => {
    switch (rating) {
      case 'Excellent': return <Badge className="bg-green-600">Excellent</Badge>;
      case 'Good': return <Badge className="bg-green-500">Good</Badge>;
      case 'Fair': return <Badge className="bg-yellow-500">Fair</Badge>;
      case 'Slow': return <Badge variant="destructive">Slow</Badge>;
      default: return <Badge variant="outline">{rating}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auditor Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">SN</TableHead>
                <TableHead>Auditor</TableHead>
                <TableHead className="text-right">Total Reviews</TableHead>
                <TableHead className="text-right">Pass Rate</TableHead>
                <TableHead className="text-right">Avg Review Time</TableHead>
                <TableHead className="text-right">This Week</TableHead>
                <TableHead className="text-right">This Month</TableHead>
                <TableHead className="text-center">Efficiency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((auditor, index) => (
                <TableRow key={auditor.auditor_name}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell className="font-medium">{auditor.auditor_name}</TableCell>
                  <TableCell className="text-right">{auditor.total_reviews}</TableCell>
                  <TableCell className="text-right">
                    <span className={auditor.pass_rate >= 70 ? 'text-green-600 font-medium' : auditor.pass_rate >= 50 ? 'text-yellow-600' : 'text-red-600'}>
                      {auditor.pass_rate.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{auditor.avg_review_hours.toFixed(1)} hrs</TableCell>
                  <TableCell className="text-right">{auditor.reviews_this_week}</TableCell>
                  <TableCell className="text-right">{auditor.reviews_this_month}</TableCell>
                  <TableCell className="text-center">
                    {getEfficiencyBadge(auditor.efficiency_rating)}
                  </TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No auditor data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
