import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContractorPerformance } from "@/hooks/useAnalytics";

interface ContractorPerformanceTableProps {
  data: ContractorPerformance[];
}

export const ContractorPerformanceTable = ({ data }: ContractorPerformanceTableProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contractor Performance Rankings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Rank</TableHead>
                <TableHead>Contractor ID</TableHead>
                <TableHead className="text-right">Interviewers</TableHead>
                <TableHead className="text-right">Total Interviews</TableHead>
                <TableHead className="text-right">Pass Rate</TableHead>
                <TableHead className="text-right">Avg Quality Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((contractor) => (
                <TableRow key={contractor.contractor_id} className={contractor.rank <= 3 ? 'bg-muted/30' : ''}>
                  <TableCell className="font-medium">
                    {contractor.rank <= 3 && (
                      <span className="text-primary font-bold">#{contractor.rank}</span>
                    )}
                    {contractor.rank > 3 && <span>#{contractor.rank}</span>}
                  </TableCell>
                  <TableCell className="font-medium">{contractor.contractor_id}</TableCell>
                  <TableCell className="text-right">{contractor.total_interviewers}</TableCell>
                  <TableCell className="text-right">{contractor.total_interviews}</TableCell>
                  <TableCell className="text-right">
                    <span className={contractor.overall_pass_rate >= 80 ? 'text-green-600 font-medium' : contractor.overall_pass_rate >= 60 ? 'text-yellow-600' : 'text-red-600'}>
                      {contractor.overall_pass_rate.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{contractor.avg_quality_score.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No contractor data available
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
