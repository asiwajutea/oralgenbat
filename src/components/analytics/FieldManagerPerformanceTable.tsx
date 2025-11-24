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
import { FieldManagerPerformance } from "@/hooks/useAnalytics";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FieldManagerPerformanceTableProps {
  data: FieldManagerPerformance[];
}

type SortField = keyof FieldManagerPerformance;
type SortDirection = 'asc' | 'desc';

export const FieldManagerPerformanceTable = ({ data }: FieldManagerPerformanceTableProps) => {
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
        <CardTitle>Field Manager Performance Rankings</CardTitle>
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
                  <SortButton field="field_manager_name">Field Manager</SortButton>
                </TableHead>
                <TableHead>
                  <SortButton field="contractor_id">Contractor</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="team_size">Team Size</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="active_team_members">Active</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="total_interviews">Interviews</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="team_pass_rate">Pass Rate</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="avg_team_names">Avg Names</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="avg_team_audio_quality">Audio Quality</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="team_re_audit_rate">Re-Audit Rate</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="interviews_this_week">This Week</SortButton>
                </TableHead>
                <TableHead className="text-right">
                  <SortButton field="interviews_this_month">This Month</SortButton>
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
              {sortedData.map((fm) => (
                <TableRow key={fm.field_manager_id} className={fm.rank <= 3 ? 'bg-muted/30' : ''}>
                  <TableCell className="font-medium">
                    {fm.rank <= 3 && (
                      <span className="text-primary font-bold">#{fm.rank}</span>
                    )}
                    {fm.rank > 3 && <span>#{fm.rank}</span>}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{fm.field_manager_name}</div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{fm.contractor_id}</span>
                  </TableCell>
                  <TableCell className="text-right">{fm.team_size}</TableCell>
                  <TableCell className="text-right">
                    <span className={fm.active_team_members === fm.team_size ? 'text-green-600 font-medium' : ''}>
                      {fm.active_team_members}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{fm.total_interviews}</TableCell>
                  <TableCell className="text-right">
                    <span className={fm.team_pass_rate >= 80 ? 'text-green-600 font-medium' : fm.team_pass_rate >= 60 ? 'text-yellow-600' : 'text-red-600'}>
                      {fm.team_pass_rate.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{fm.avg_team_names.toFixed(0)}</TableCell>
                  <TableCell className="text-right">{fm.avg_team_audio_quality.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">
                    <span className={fm.team_re_audit_rate <= 10 ? 'text-green-600' : fm.team_re_audit_rate <= 20 ? 'text-yellow-600' : 'text-red-600'}>
                      {fm.team_re_audit_rate.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{fm.interviews_this_week}</TableCell>
                  <TableCell className="text-right">{fm.interviews_this_month}</TableCell>
                  <TableCell className="text-right font-medium">{fm.performance_score.toFixed(1)}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={getGradeColor(fm.grade)}>{fm.grade}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {sortedData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
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
