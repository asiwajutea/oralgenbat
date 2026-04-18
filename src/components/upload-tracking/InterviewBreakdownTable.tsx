import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Eye, ChevronLeft, ChevronRight, Search, RotateCcw, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { useUploadTrackingInterviews, type UploadInterviewRow } from "@/hooks/useUploadTracking";
import { cn } from "@/lib/utils";

interface Props {
  startDate: Date;
  endDate: Date;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "Pending", label: "Pending" },
  { value: "Awaiting Review", label: "Awaiting Review" },
  { value: "Passed", label: "Passed" },
  { value: "Failed", label: "Failed" },
];

const ARTIFACT_COLORS: Record<string, string> = {
  PDF: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  ZIP: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  Audio: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30",
  Photos: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Metadata: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
};

function StatusBadge({ status, override }: { status: string; override: boolean }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    Passed: { cls: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
    Failed: { cls: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30", icon: <XCircle className="h-3 w-3" /> },
    "Awaiting Review": { cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", icon: <Clock className="h-3 w-3" /> },
    Pending: { cls: "bg-muted text-muted-foreground border-border", icon: <Clock className="h-3 w-3" /> },
  };
  const v = map[status] || map.Pending;
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap", v.cls)}>
      {v.icon}
      {status}
      {override && <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />}
    </span>
  );
}

export function InterviewBreakdownTable({ startDate, endDate }: Props) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [selected, setSelected] = useState<UploadInterviewRow | null>(null);

  const { data, isLoading } = useUploadTrackingInterviews(
    startDate,
    endDate,
    page,
    pageSize,
    search,
    status === "all" ? null : status,
  );

  const totalCount = data && data.length > 0 ? Number(data[0].total_count) : 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-base sm:text-lg">Interview Breakdown</CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 sm:flex-none sm:w-64">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search folder name..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="h-8 pl-7 text-xs"
              />
            </div>
            <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={handleSearch}>
              Search
            </Button>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger className="h-8 w-[80px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">{n}/page</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-0">
        <TooltipProvider delayDuration={200}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] py-2">Folder</TableHead>
                  <TableHead className="text-[11px] py-2">Informant</TableHead>
                  <TableHead className="text-[11px] py-2 hidden md:table-cell">Field Manager</TableHead>
                  <TableHead className="text-[11px] py-2 hidden lg:table-cell">Interviewer</TableHead>
                  <TableHead className="text-[11px] py-2 hidden lg:table-cell">Location</TableHead>
                  <TableHead className="text-[11px] py-2 text-right">Names</TableHead>
                  <TableHead className="text-[11px] py-2">Status</TableHead>
                  <TableHead className="text-[11px] py-2 hidden sm:table-cell">Re-audit</TableHead>
                  <TableHead className="text-[11px] py-2 hidden sm:table-cell">Artifacts</TableHead>
                  <TableHead className="text-[11px] py-2 w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j} className="py-1.5"><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : !data || data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8 text-xs">
                      No interviews found for this period
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => {
                    const folder = row.file_name.replace(/\.pdf$/i, "");
                    const artifacts = row.artifact_correction || [];
                    return (
                      <TableRow key={row.audit_id} className="hover:bg-muted/30">
                        <TableCell className="py-1.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-[11px] truncate max-w-[140px] inline-block align-middle">{folder}</span>
                            </TooltipTrigger>
                            <TooltipContent><span className="font-mono text-xs">{folder}</span></TooltipContent>
                          </Tooltip>
                          <div className="text-[10px] text-muted-foreground">{format(new Date(row.uploaded_at), "MMM dd, HH:mm")}</div>
                        </TableCell>
                        <TableCell className="py-1.5 text-xs max-w-[140px] truncate">
                          {row.interviewee_name ? (
                            <Tooltip>
                              <TooltipTrigger asChild><span className="truncate block">{row.interviewee_name}</span></TooltipTrigger>
                              <TooltipContent>{row.interviewee_name}</TooltipContent>
                            </Tooltip>
                          ) : <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs hidden md:table-cell max-w-[120px] truncate">
                          {row.field_manager || <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs hidden lg:table-cell max-w-[120px] truncate">
                          {row.interviewer_name ? (
                            <div className="flex flex-col">
                              <span className="truncate">{row.interviewer_name}</span>
                              {row.interviewer_code && <span className="text-[10px] text-muted-foreground font-mono">{row.interviewer_code}</span>}
                            </div>
                          ) : <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs hidden lg:table-cell max-w-[120px] truncate">
                          {row.interview_location || <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="py-1.5 text-xs text-right font-medium">
                          {row.total_names ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <StatusBadge status={row.status} override={row.passed_with_failures} />
                        </TableCell>
                        <TableCell className="py-1.5 hidden sm:table-cell">
                          {row.re_audit_count > 0 ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                              <RotateCcw className="h-2.5 w-2.5" />×{row.re_audit_count}
                            </Badge>
                          ) : <span className="text-muted-foreground text-[10px]">—</span>}
                        </TableCell>
                        <TableCell className="py-1.5 hidden sm:table-cell">
                          {artifacts.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {artifacts.map((a, i) => (
                                <span key={i} className={cn("text-[9px] px-1 py-0 rounded border font-medium", ARTIFACT_COLORS[a] || "bg-muted text-muted-foreground border-border")}>
                                  {a}
                                </span>
                              ))}
                            </div>
                          ) : <span className="text-muted-foreground text-[10px]">—</span>}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelected(row)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t text-xs">
          <div className="text-muted-foreground">
            {totalCount > 0 ? (
              <>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount.toLocaleString()}</>
            ) : "No results"}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0 || isLoading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="h-3 w-3" /> Prev
            </Button>
            <span className="text-muted-foreground whitespace-nowrap">Page {page + 1} / {Math.max(1, totalPages)}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page + 1 >= totalPages || isLoading} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{selected?.file_name.replace(/\.pdf$/i, "")}</DialogTitle>
            <DialogDescription>
              Uploaded {selected && format(new Date(selected.uploaded_at), "MMM dd, yyyy HH:mm")}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <StatusBadge status={selected.status} override={selected.passed_with_failures} />
                </div>
                <div>
                  <p className="text-muted-foreground">Total Names</p>
                  <p className="font-medium">{selected.total_names ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Informant</p>
                  <p className="font-medium">{selected.interviewee_name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Field Manager</p>
                  <p className="font-medium">{selected.field_manager || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Interviewer</p>
                  <p className="font-medium">{selected.interviewer_name || "—"} {selected.interviewer_code && <span className="text-muted-foreground font-mono">({selected.interviewer_code})</span>}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Location</p>
                  <p className="font-medium">{selected.interview_location || "—"}</p>
                </div>
              </div>

              {selected.re_audit_count > 0 && (
                <div className="text-xs">
                  <p className="text-muted-foreground">Re-audits</p>
                  <Badge variant="outline" className="mt-1 gap-1"><RotateCcw className="h-3 w-3" /> ×{selected.re_audit_count}</Badge>
                </div>
              )}

              {selected.artifact_correction && selected.artifact_correction.length > 0 && (
                <div className="text-xs">
                  <p className="text-muted-foreground mb-1">Affected Artifacts</p>
                  <div className="flex flex-wrap gap-1">
                    {selected.artifact_correction.map((a, i) => (
                      <span key={i} className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", ARTIFACT_COLORS[a] || "bg-muted text-muted-foreground border-border")}>
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selected.review_comment && (
                <div className="text-xs">
                  <p className="text-muted-foreground mb-1">Failure Reason</p>
                  <div className="bg-muted/50 rounded p-2 whitespace-pre-wrap">{selected.review_comment}</div>
                </div>
              )}

              {selected.action_plan && (
                <div className="text-xs">
                  <p className="text-muted-foreground mb-1">Action Plan</p>
                  <div className="bg-muted/50 rounded p-2 whitespace-pre-wrap">{selected.action_plan}</div>
                </div>
              )}

              {selected.passed_with_failures && (selected.pass_override_reason || selected.pass_override_action_plan) && (
                <div className="text-xs border-l-2 border-amber-500 pl-2">
                  <p className="text-amber-700 dark:text-amber-400 font-medium mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Passed with Override
                  </p>
                  {selected.pass_override_reason && (
                    <div className="mb-1">
                      <p className="text-muted-foreground">Reason</p>
                      <div className="bg-muted/50 rounded p-2 whitespace-pre-wrap">{selected.pass_override_reason}</div>
                    </div>
                  )}
                  {selected.pass_override_action_plan && (
                    <div>
                      <p className="text-muted-foreground">Override Action Plan</p>
                      <div className="bg-muted/50 rounded p-2 whitespace-pre-wrap">{selected.pass_override_action_plan}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
