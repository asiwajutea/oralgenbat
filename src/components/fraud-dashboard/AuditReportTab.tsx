import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { AgentFraudProfile } from "@/utils/fraudCalculations";

interface Props {
  profiles: AgentFraudProfile[];
}

export const AuditReportTab = ({ profiles }: Props) => {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const totalPassed = profiles.reduce((s, p) => s + p.passedCount, 0);
  const totalFailed = profiles.reduce((s, p) => s + p.failedCount, 0);
  const totalPending = profiles.reduce((s, p) => s + p.pendingCount, 0);
  const totalReAudit = profiles.reduce((s, p) => s + p.reAuditCount, 0);
  const totalAll = profiles.reduce((s, p) => s + p.total_interviews, 0);

  const filtered = useMemo(() => {
    if (!search) return profiles;
    const s = search.toLowerCase();
    return profiles.filter(p => p.interviewer_code.toLowerCase().includes(s) || p.contractor_id.toLowerCase().includes(s));
  }, [profiles, search]);

  const sorted = useMemo(() => 
    [...filtered].sort((a, b) => b.total_interviews - a.total_interviews),
    [filtered]
  );

  const getAgentLink = (code: string) => {
    if (userRole === 'super_admin') return `/analytics/agent-fraud/${code}`;
    return `/my-analytics/agent/${code}`;
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{totalAll}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Passed</p><p className="text-2xl font-bold text-green-600 dark:text-green-400">{totalPassed}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Failed</p><p className="text-2xl font-bold text-destructive">{totalFailed}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Pending</p><p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{totalPending}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Re-Audit</p><p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{totalReAudit}</p></CardContent></Card>
      </div>

      {/* Per-Agent Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">Per-Agent Audit Summary</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search agent..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-56" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Contractor</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Passed</TableHead>
                <TableHead>Failed</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Re-Audit</TableHead>
                <TableHead>Pass Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No agents found</TableCell></TableRow>
              ) : (
                sorted.map(p => {
                  const reviewed = p.passedCount + p.failedCount;
                  const passRate = reviewed > 0 ? (p.passedCount / reviewed) * 100 : 0;
                  return (
                    <TableRow key={p.interviewer_code} className="cursor-pointer hover:bg-accent/50" onClick={() => navigate(getAgentLink(p.interviewer_code))}>
                      <TableCell className="font-medium">{p.interviewer_code}</TableCell>
                      <TableCell className="text-sm">{p.contractor_id}</TableCell>
                      <TableCell>{p.total_interviews}</TableCell>
                      <TableCell className="text-green-600 dark:text-green-400">{p.passedCount}</TableCell>
                      <TableCell className="text-destructive">{p.failedCount}</TableCell>
                      <TableCell>{p.pendingCount}</TableCell>
                      <TableCell>{p.reAuditCount}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={passRate >= 80 ? 'text-green-700 dark:text-green-400' : passRate >= 60 ? 'text-yellow-700 dark:text-yellow-400' : 'text-destructive'}>
                          {passRate.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
