import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportButton } from "@/components/analytics/ExportButton";
import { Search, ArrowUpDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AgentFraudProfile } from "@/utils/fraudCalculations";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  profiles: AgentFraudProfile[];
}

type SortKey = 'rank' | 'interviewer_code' | 'total_interviews' | 'passRate' | 'avgNames' | 'avgFamilyStoryDuration' | 'reAuditRate' | 'overallFraudScore';

const gradeColors: Record<string, string> = {
  A: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  B: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  C: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  D: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const rowBg: Record<string, string> = {
  A: '',
  B: '',
  C: 'bg-orange-50/50 dark:bg-orange-950/10',
  D: 'bg-red-50/50 dark:bg-red-950/10',
};

export const LeaderboardTab = ({ profiles }: Props) => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('overallFraudScore');
  const [sortAsc, setSortAsc] = useState(false);
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const filtered = useMemo(() => {
    let list = profiles;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(p => 
        p.interviewer_code.toLowerCase().includes(s) ||
        (p.interviewer_name || '').toLowerCase().includes(s) ||
        p.contractor_id.toLowerCase().includes(s)
      );
    }
    
    list = [...list].sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case 'total_interviews': av = a.total_interviews; bv = b.total_interviews; break;
        case 'passRate': av = a.indicators.passRate; bv = b.indicators.passRate; break;
        case 'avgNames': av = a.avgNames; bv = b.avgNames; break;
        case 'avgFamilyStoryDuration': av = a.avgFamilyStoryDuration; bv = b.avgFamilyStoryDuration; break;
        case 'reAuditRate': av = a.indicators.reAuditRate; bv = b.indicators.reAuditRate; break;
        default: av = a.overallFraudScore; bv = b.overallFraudScore;
      }
      return sortAsc ? av - bv : bv - av;
    });
    
    return list;
  }, [profiles, search, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const exportData = filtered.map((p, i) => ({
    Rank: i + 1,
    'Agent Code': p.interviewer_code,
    Name: p.interviewer_name || '',
    Contractor: p.contractor_id,
    'Total Interviews': p.total_interviews,
    'Pass Rate': `${p.indicators.passRate.toFixed(1)}%`,
    'Avg Names': p.avgNames.toFixed(1),
    'Avg Audio (min)': (p.avgFamilyStoryDuration / 60).toFixed(1),
    'Fraud Score': p.overallFraudScore.toFixed(1),
    'Fraud Grade': p.fraudGrade,
    Classification: p.classification,
  }));

  const getAgentLink = (code: string) => {
    if (userRole === 'super_admin') return `/analytics/agent-fraud/${code}`;
    return `/my-analytics/agent/${code}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-base">Agent Leaderboard</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search agent, name, contractor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-64" />
            </div>
            <ExportButton data={exportData} filename="agent-leaderboard" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Contractor</TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('total_interviews')}>
                <span className="flex items-center gap-1">Interviews <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('passRate')}>
                <span className="flex items-center gap-1">Pass Rate <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('avgNames')}>
                <span className="flex items-center gap-1">Avg Names <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('avgFamilyStoryDuration')}>
                <span className="flex items-center gap-1">Avg Audio <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => handleSort('overallFraudScore')}>
                <span className="flex items-center gap-1">Fraud Score <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead>Grade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No agents found</TableCell></TableRow>
            ) : (
              filtered.map((p, i) => (
                <TableRow 
                  key={p.interviewer_code} 
                  className={`cursor-pointer hover:bg-accent/50 ${rowBg[p.fraudGrade]}`}
                  onClick={() => navigate(getAgentLink(p.interviewer_code))}
                >
                  <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium">{p.interviewer_code}</span>
                      {p.interviewer_name && <p className="text-xs text-muted-foreground">{p.interviewer_name}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{p.contractor_id}</TableCell>
                  <TableCell>{p.total_interviews}</TableCell>
                  <TableCell>{p.indicators.passRate.toFixed(1)}%</TableCell>
                  <TableCell>{p.avgNames.toFixed(0)}</TableCell>
                  <TableCell>{(p.avgFamilyStoryDuration / 60).toFixed(1)}m</TableCell>
                  <TableCell className="font-mono font-bold">{p.overallFraudScore.toFixed(1)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={gradeColors[p.fraudGrade]}>
                      {p.fraudGrade}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
