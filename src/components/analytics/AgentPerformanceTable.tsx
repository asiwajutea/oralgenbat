import { useState } from "react";
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
import { AgentPerformance } from "@/hooks/useAnalytics";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AgentPerformanceTableProps {
  data: AgentPerformance[];
}

type SortField = keyof AgentPerformance;
type SortDirection = 'asc' | 'desc';

export const AgentPerformanceTable = ({ data }: AgentPerformanceTableProps) => {
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * multiplier;
    }
    return String(aVal).localeCompare(String(bVal)) * multiplier;
  });

  const getGradeBadgeVariant = (grade: string) => {
    switch (grade) {
      case 'A': return 'default';
      case 'B': return 'secondary';
      case 'C': return 'outline';
      case 'D': return 'outline';
      case 'F': return 'destructive';
      default: return 'outline';
    }
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'bg-green-600 text-white';
      case 'B': return 'bg-green-500 text-white';
      case 'C': return 'bg-yellow-500 text-white';
      case 'D': return 'bg-orange-500 text-white';
      case 'F': return 'bg-red-600 text-white';
      default: return '';
    }
  };

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button variant="ghost" size="sm" onClick={() => handleSort(field)} className="h-8 -ml-3">
      {children}
      {sortField === field ? (
        sortDirection === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />
      ) : (
        <ArrowUpDown className="ml-1 h-3 w-3" />
      )}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Performance Rankings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">
                  <SortButton field="rank">Rank</SortButton>
                </TableHead>
                <TableHead>
                  <SortButton field="interviewer_code">Agent</SortButton>
                </TableHead>
                <TableHead>
                  <SortButton field="contractor_id">Contractor</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="total_interviews">Interviews</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="pass_rate">Pass Rate</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="avg_names">Avg Names</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="avg_duration">Avg Duration</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="avg_audio_quality">Audio Quality</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="re_audit_rate">Re-Audit Rate</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="performance_score">Score</SortButton>
                </TableHead>
                <TableHead className="text-center">
                  <SortButton field="grade">Grade</SortButton>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((agent) => (
                <TableRow key={agent.interviewer_code} className={agent.rank <= 3 ? 'bg-muted/30' : ''}>
                  <TableCell className="font-medium">
                    {agent.rank <= 3 && (
                      <span className="text-primary font-bold">#{agent.rank}</span>
                    )}
                    {agent.rank > 3 && <span>#{agent.rank}</span>}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{agent.interviewer_code}</div>
                    {agent.interviewer_name && (
                      <div className="text-sm text-muted-foreground">{agent.interviewer_name}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{agent.contractor_id}</span>
                  </TableCell>
                  <TableCell className="text-right">{agent.total_interviews}</TableCell>
                  <TableCell className="text-right">
                    <span className={agent.pass_rate >= 80 ? 'text-green-600 font-medium' : agent.pass_rate >= 60 ? 'text-yellow-600' : 'text-red-600'}>
                      {agent.pass_rate.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{agent.avg_names.toFixed(0)}</TableCell>
                  <TableCell className="text-right">{agent.avg_duration.toFixed(1)} min</TableCell>
                  <TableCell className="text-right">{agent.avg_audio_quality.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">
                    <span className={agent.re_audit_rate <= 10 ? 'text-green-600' : agent.re_audit_rate <= 20 ? 'text-yellow-600' : 'text-red-600'}>
                      {agent.re_audit_rate.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium">{agent.performance_score.toFixed(1)}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={getGradeColor(agent.grade)}>{agent.grade}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {sortedData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                    No data available for the selected filters
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
