import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ChevronDown, Search } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AgentFraudProfile } from "@/utils/fraudCalculations";

interface Props {
  profiles: AgentFraudProfile[];
}

const scoreColor = (score: number) => {
  if (score < 20) return 'text-green-600 dark:text-green-400';
  if (score < 40) return 'text-yellow-600 dark:text-yellow-400';
  if (score < 70) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
};

const gradeColors: Record<string, string> = {
  A: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  B: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  C: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  D: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const IndicatorDetails = ({ p }: { p: AgentFraudProfile }) => (
  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-3 text-sm">
    <div>
      <p className="font-medium text-xs text-muted-foreground mb-1">Interval Analysis</p>
      <p>{p.indicators.closeIntervals.length} close intervals (&lt;45 min)</p>
      <p className="text-xs text-muted-foreground">{p.total_interviews} total interviews</p>
    </div>
    <div>
      <p className="font-medium text-xs text-muted-foreground mb-1">Audio Duration</p>
      <p>{p.indicators.shortFamilyStories.length} short family stories</p>
      <p>{p.indicators.shortPedigrees.length} short pedigrees</p>
    </div>
    <div>
      <p className="font-medium text-xs text-muted-foreground mb-1">Names Pattern</p>
      <p>{p.indicators.repeatedNamesCount} repeated patterns</p>
      {p.indicators.mostCommonCount && <p className="text-xs">Most common: {p.indicators.mostCommonCount} ({p.indicators.mostCommonFrequency}x)</p>}
    </div>
    <div>
      <p className="font-medium text-xs text-muted-foreground mb-1">Page Boundary</p>
      <p>{p.indicators.boundaryHits}/{p.indicators.totalInterviews} hits ({p.indicators.actualBoundaryRate.toFixed(1)}%)</p>
      <p className="text-xs">Expected: {p.indicators.expectedBoundaryRate}%</p>
    </div>
    <div>
      <p className="font-medium text-xs text-muted-foreground mb-1">Pass Rate / Re-Audit</p>
      <p>Pass: {p.indicators.passRate.toFixed(1)}%</p>
      <p>Re-audit: {p.indicators.reAuditRate.toFixed(1)}%</p>
    </div>
  </div>
);

export const FraudBreakdownTab = ({ profiles }: Props) => {
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const filtered = useMemo(() => {
    let list = profiles;
    if (gradeFilter !== 'all') list = list.filter(p => p.fraudGrade === gradeFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(p => p.interviewer_code.toLowerCase().includes(s) || p.contractor_id.toLowerCase().includes(s));
    }
    return list;
  }, [profiles, search, gradeFilter]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <CardTitle className="text-base">Fraud Indicator Breakdown</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search agent..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 w-full sm:w-48" />
            </div>
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="w-28 sm:w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Grades</SelectItem>
                <SelectItem value="A">Grade A</SelectItem>
                <SelectItem value="B">Grade B</SelectItem>
                <SelectItem value="C">Grade C</SelectItem>
                <SelectItem value="D">Grade D</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isMobile ? (
          /* Mobile: Accordion cards */
          filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No agents found</p>
          ) : (
            <Accordion type="single" collapsible className="space-y-2">
              {filtered.map(p => (
                <AccordionItem key={p.interviewer_code} value={p.interviewer_code} className="border rounded-lg px-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center justify-between w-full mr-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{p.interviewer_code}</p>
                        <p className="text-xs text-muted-foreground">{p.contractor_id}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`font-bold text-sm ${scoreColor(p.overallFraudScore)}`}>{p.overallFraudScore.toFixed(1)}</span>
                        <Badge variant="outline" className={`text-xs ${gradeColors[p.fraudGrade]}`}>{p.fraudGrade}</Badge>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    {/* Score summary row */}
                    <div className="grid grid-cols-5 gap-1 mb-3 text-center">
                      {[
                        { label: 'Int', score: p.indicators.intervalFraudScore },
                        { label: 'Aud', score: p.indicators.audioDurationFraudScore },
                        { label: 'Nam', score: p.indicators.namesPatternFraudScore },
                        { label: 'Bnd', score: p.indicators.pageBoundaryFraudScore },
                        { label: 'Ano', score: p.indicators.anomalyScore },
                      ].map(item => (
                        <div key={item.label} className="bg-muted/50 rounded p-1.5">
                          <p className="text-[10px] text-muted-foreground">{item.label}</p>
                          <p className={`text-sm font-bold ${scoreColor(item.score)}`}>{item.score.toFixed(0)}</p>
                        </div>
                      ))}
                    </div>
                    <IndicatorDetails p={p} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )
        ) : (
          /* Desktop: Table */
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Agent</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Audio</TableHead>
                  <TableHead>Names</TableHead>
                  <TableHead>Boundary</TableHead>
                  <TableHead>Anomaly</TableHead>
                  <TableHead>Overall</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No agents found</TableCell></TableRow>
                ) : (
                  filtered.map(p => (
                    <Collapsible key={p.interviewer_code} asChild open={expandedCode === p.interviewer_code} onOpenChange={open => setExpandedCode(open ? p.interviewer_code : null)}>
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow className="cursor-pointer hover:bg-accent/50">
                            <TableCell><ChevronDown className={`h-4 w-4 transition-transform ${expandedCode === p.interviewer_code ? 'rotate-180' : ''}`} /></TableCell>
                            <TableCell>
                              <span className="font-medium">{p.interviewer_code}</span>
                              <span className="text-xs text-muted-foreground ml-2">{p.contractor_id}</span>
                            </TableCell>
                            <TableCell><Badge variant="outline" className={gradeColors[p.fraudGrade]}>{p.fraudGrade}</Badge></TableCell>
                            <TableCell className={scoreColor(p.indicators.intervalFraudScore)}>{p.indicators.intervalFraudScore.toFixed(0)}</TableCell>
                            <TableCell className={scoreColor(p.indicators.audioDurationFraudScore)}>{p.indicators.audioDurationFraudScore.toFixed(0)}</TableCell>
                            <TableCell className={scoreColor(p.indicators.namesPatternFraudScore)}>{p.indicators.namesPatternFraudScore.toFixed(0)}</TableCell>
                            <TableCell className={scoreColor(p.indicators.pageBoundaryFraudScore)}>{p.indicators.pageBoundaryFraudScore.toFixed(0)}</TableCell>
                            <TableCell className={scoreColor(p.indicators.anomalyScore)}>{p.indicators.anomalyScore.toFixed(0)}</TableCell>
                            <TableCell className={`font-bold ${scoreColor(p.overallFraudScore)}`}>{p.overallFraudScore.toFixed(1)}</TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <TableRow>
                            <TableCell colSpan={9} className="bg-muted/30 px-6 py-3">
                              <IndicatorDetails p={p} />
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
