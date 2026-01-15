import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Search, ArrowUpDown, ExternalLink } from "lucide-react";
import { ScopedAgent } from "@/hooks/useRoleAnalytics";

interface RolePerformanceTableProps {
  agents: ScopedAgent[];
  isLoading?: boolean;
  title?: string;
  showFraudColumn?: boolean;
}

type SortField = 'interviewer_code' | 'totalInterviews' | 'passRate' | 'overallFraudScore';
type SortDirection = 'asc' | 'desc';

export const RolePerformanceTable = ({
  agents,
  isLoading = false,
  title = "Agent Performance",
  showFraudColumn = true,
}: RolePerformanceTableProps) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>('passRate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const getGradeColor = (grade: 'A' | 'B' | 'C' | 'D') => {
    switch (grade) {
      case 'D': return 'bg-destructive text-destructive-foreground';
      case 'C': return 'bg-orange-500 text-white';
      case 'B': return 'bg-yellow-500 text-black';
      case 'A': return 'bg-green-500 text-white';
    }
  };

  const getPassRateColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600 dark:text-green-400';
    if (rate >= 80) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredAndSortedAgents = agents
    .filter(agent => 
      agent.interviewer_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.interviewer_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      const multiplier = sortDirection === 'asc' ? 1 : -1;
      if (sortField === 'interviewer_code') {
        return multiplier * a.interviewer_code.localeCompare(b.interviewer_code);
      }
      return multiplier * (a[sortField] - b[sortField]);
    });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (agents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No agent data available in your scope
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {title}
            <Badge variant="outline">{agents.length}</Badge>
          </CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => handleSort('interviewer_code')}
                >
                  <div className="flex items-center gap-1">
                    Agent
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-accent text-center"
                  onClick={() => handleSort('totalInterviews')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Interviews
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="text-center">Passed</TableHead>
                <TableHead className="text-center">Failed</TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-accent text-center"
                  onClick={() => handleSort('passRate')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Pass Rate
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                {showFraudColumn && (
                  <TableHead 
                    className="cursor-pointer hover:bg-accent text-center"
                    onClick={() => handleSort('overallFraudScore')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Fraud
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                )}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedAgents.slice(0, 20).map((agent) => (
                <TableRow key={agent.interviewer_code}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{agent.interviewer_code}</p>
                      {agent.interviewer_name && (
                        <p className="text-xs text-muted-foreground">{agent.interviewer_name}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{agent.totalInterviews}</TableCell>
                  <TableCell className="text-center text-green-600">{agent.passedCount}</TableCell>
                  <TableCell className="text-center text-red-600">{agent.failedCount}</TableCell>
                  <TableCell className="text-center">
                    <span className={`font-semibold ${getPassRateColor(agent.passRate)}`}>
                      {agent.passRate.toFixed(1)}%
                    </span>
                  </TableCell>
                  {showFraudColumn && (
                    <TableCell className="text-center">
                      <Badge className={getGradeColor(agent.fraudGrade)}>
                        {agent.fraudGrade}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/my-analytics/agent/${agent.interviewer_code}`)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {filteredAndSortedAgents.length > 20 && (
          <p className="text-sm text-muted-foreground text-center mt-3">
            Showing 20 of {filteredAndSortedAgents.length} agents
          </p>
        )}
      </CardContent>
    </Card>
  );
};
