import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Eye, ChevronLeft, ChevronRight, Search, RotateCcw, AlertTriangle,
  CheckCircle2, XCircle, Clock, FileDown, Loader2, ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import {
  useUploadTrackingInterviews,
  fetchAllUploadTrackingInterviews,
  type UploadInterviewRow,
} from "@/hooks/useUploadTracking";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import { toast } from "@/hooks/use-toast";

interface Props {
  startDate: Date;
  endDate: Date;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "Pending", label: "Pending" },
  { value: "Awaiting Review", label: "Awaiting Review" },
  { value: "Passed", label: "Passed" },
  { value: "Pass with Override", label: "Pass with Override" },
  { value: "Failed", label: "Failed" },
];

const ARTIFACT_OPTIONS = [
  { value: "all", label: "All Artifacts" },
  { value: "PDF", label: "PDF" },
  { value: "ZIP", label: "ZIP" },
  { value: "Audio", label: "Audio" },
  { value: "Photos", label: "Photos" },
  { value: "Metadata", label: "Metadata" },
];

const ARTIFACT_COLORS: Record<string, string> = {
  PDF: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
  ZIP: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40",
  Audio: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40",
  Photos: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  Metadata: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/40",
};

// Display label combining DB status with override flag
function displayStatus(row: { status: string; passed_with_failures: boolean }) {
  if (row.status === "Audit Passed") return row.passed_with_failures ? "Pass with Override" : "Passed";
  if (row.status === "Audit Failed") return "Failed";
  return row.status;
}

// Background tint applied to entire row for at-a-glance scanning
function rowTintClass(row: { status: string; passed_with_failures: boolean }) {
  const s = displayStatus(row);
  if (s === "Passed") return "bg-green-500/[0.04] hover:bg-green-500/10";
  if (s === "Pass with Override") return "bg-amber-500/[0.06] hover:bg-amber-500/12";
  if (s === "Failed") return "bg-red-500/[0.05] hover:bg-red-500/10";
  if (s === "Awaiting Review") return "bg-amber-500/[0.04] hover:bg-amber-500/10";
  return "hover:bg-muted/40";
}

function StatusBadge({ row }: { row: { status: string; passed_with_failures: boolean } }) {
  const label = displayStatus(row);
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    Passed: { cls: "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/40", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    "Pass with Override": { cls: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    Failed: { cls: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40", icon: <XCircle className="h-3.5 w-3.5" /> },
    "Awaiting Review": { cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40", icon: <Clock className="h-3.5 w-3.5" /> },
    Pending: { cls: "bg-muted text-muted-foreground border-border", icon: <Clock className="h-3.5 w-3.5" /> },
  };
  const v = map[label] || map.Pending;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium whitespace-nowrap", v.cls)}>
      {v.icon}
      {label}
    </span>
  );
}

export function InterviewBreakdownTable({ startDate, endDate }: Props) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [artifact, setArtifact] = useState<string>("all");
  const [selected, setSelected] = useState<UploadInterviewRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useUploadTrackingInterviews(
    startDate,
    endDate,
    page,
    pageSize,
    search,
    status === "all" ? null : status,
    artifact === "all" ? null : artifact,
  );

  const totalCount = data && data.length > 0 ? Number(data[0].total_count) : 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const all = await fetchAllUploadTrackingInterviews(
        startDate,
        endDate,
        search,
        status === "all" ? null : status,
        artifact === "all" ? null : artifact,
      );
      if (all.length === 0) {
        toast({ title: "No data", description: "There are no interviews to export for the current filters." });
        return;
      }

      // Group by Field Manager
      const grouped = new Map<string, UploadInterviewRow[]>();
      all.forEach((r) => {
        const key = r.field_manager?.trim() || "Unassigned";
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(r);
      });
      const fmKeys = Array.from(grouped.keys()).sort();

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      const maxLineWidth = pageWidth - margin * 2;
      let pageNum = 1;

      const addPageHeader = (firstPage = false) => {
        doc.setFillColor(31, 41, 55);
        doc.rect(0, 0, pageWidth, firstPage ? 25 : 15, "F");
        if (firstPage) {
          doc.setFillColor(59, 130, 246);
          doc.circle(margin + 8, 12.5, 8, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("BAC", margin + 8, 14, { align: "center" });
          doc.setFontSize(16);
          doc.text("Backend Audit Center", margin + 22, 15);
        } else {
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.text("Backend Audit Center - Upload Tracking Report", margin, 10);
          doc.text(`Page ${pageNum}`, pageWidth - margin, 10, { align: "right" });
        }
        doc.setTextColor(0, 0, 0);
      };

      addPageHeader(true);

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Upload Tracking Report", margin, 35);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${format(new Date(), "PPp")}`, margin, 42);
      doc.text(`Period: ${format(startDate, "PP")} - ${format(endDate, "PP")}`, margin + 70, 42);
      doc.text(`Total: ${all.length} interviews | ${fmKeys.length} field manager(s)`, margin, 47);

      let y = 56;

      fmKeys.forEach((fm, fmIdx) => {
        const rows = grouped.get(fm)!;
        const totalNames = rows.reduce((s, r) => s + (r.total_names || 0), 0);

        // FM section header
        if (y > 270) { doc.addPage(); pageNum++; addPageHeader(false); y = 22; }
        doc.setFillColor(243, 244, 246);
        doc.rect(margin - 2, y - 5, maxLineWidth + 4, 8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(31, 41, 55);
        doc.text(`Field Manager: ${fm}`, margin, y);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`${rows.length} interview(s) | ${totalNames.toLocaleString()} names`, pageWidth - margin, y, { align: "right" });
        doc.setTextColor(0, 0, 0);
        y += 8;

        rows.forEach((a, i) => {
          const folder = a.file_name.replace(/\.pdf$/i, "");
          const label = displayStatus(a);

          // Estimate space
          let est = 26;
          if (a.artifact_correction?.length) est += 4;
          if (a.review_comment) est += doc.splitTextToSize(a.review_comment, maxLineWidth).length * 3.5 + 4;
          if (a.action_plan) est += doc.splitTextToSize(a.action_plan, maxLineWidth).length * 3.5 + 4;
          if (a.passed_with_failures && a.pass_override_reason) {
            est += doc.splitTextToSize(a.pass_override_reason, maxLineWidth).length * 3.5 + 4;
          }
          if (a.passed_with_failures && a.pass_override_action_plan) {
            est += doc.splitTextToSize(a.pass_override_action_plan, maxLineWidth).length * 3.5 + 4;
          }
          if (y + est > 285) { doc.addPage(); pageNum++; addPageHeader(false); y = 22; }

          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.text(`${i + 1}. ${folder}`, margin, y);
          y += 4.5;
          doc.setFont("helvetica", "normal");

          doc.text(`Status: ${label} | Re-audits: ${a.re_audit_count || 0} | Names: ${a.total_names ?? "-"}`, margin, y);
          y += 4.5;
          doc.text(`Uploaded: ${format(new Date(a.uploaded_at), "PPp")}`, margin, y);
          y += 4.5;
          doc.text(`Informant: ${a.interviewee_name || "-"} | Interviewer: ${a.interviewer_name || "-"}${a.interviewer_code ? ` (${a.interviewer_code})` : ""}`, margin, y);
          y += 4.5;
          doc.text(`Location: ${a.interview_location || "-"} | Reviewed by: ${a.reviewed_by || "-"}`, margin, y);
          y += 4.5;

          if (a.artifact_correction?.length) {
            doc.text(`Affected Artifacts: ${a.artifact_correction.join(", ")}`, margin, y);
            y += 4.5;
          }

          if (a.review_comment) {
            doc.setFont("helvetica", "bold");
            doc.text("Failure Reason:", margin, y);
            y += 4;
            doc.setFont("helvetica", "normal");
            const lines = doc.splitTextToSize(a.review_comment, maxLineWidth);
            lines.forEach((ln: string) => {
              if (y > 285) { doc.addPage(); pageNum++; addPageHeader(false); y = 22; }
              doc.text(ln, margin, y);
              y += 3.5;
            });
            y += 1;
          }

          if (a.action_plan) {
            doc.setFont("helvetica", "bold");
            doc.text("Action Plan:", margin, y);
            y += 4;
            doc.setFont("helvetica", "normal");
            const lines = doc.splitTextToSize(a.action_plan, maxLineWidth);
            lines.forEach((ln: string) => {
              if (y > 285) { doc.addPage(); pageNum++; addPageHeader(false); y = 22; }
              doc.text(ln, margin, y);
              y += 3.5;
            });
            y += 1;
          }

          if (a.passed_with_failures) {
            doc.setFont("helvetica", "bold");
            doc.setTextColor(180, 83, 9);
            doc.text("Pass-with-Override Reason:", margin, y);
            y += 4;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(0, 0, 0);
            const reason = a.pass_override_reason || "(no reason provided)";
            doc.splitTextToSize(reason, maxLineWidth).forEach((ln: string) => {
              if (y > 285) { doc.addPage(); pageNum++; addPageHeader(false); y = 22; }
              doc.text(ln, margin, y);
              y += 3.5;
            });
            if (a.pass_override_action_plan) {
              doc.setFont("helvetica", "bold");
              doc.text("Override Action Plan:", margin, y);
              y += 4;
              doc.setFont("helvetica", "normal");
              doc.splitTextToSize(a.pass_override_action_plan, maxLineWidth).forEach((ln: string) => {
                if (y > 285) { doc.addPage(); pageNum++; addPageHeader(false); y = 22; }
                doc.text(ln, margin, y);
                y += 3.5;
              });
            }
            y += 1;
          }

          y += 4;
        });

        if (fmIdx < fmKeys.length - 1) y += 2;
      });

      const fileName = `upload-tracking-${format(startDate, "yyyy-MM-dd")}_to_${format(endDate, "yyyy-MM-dd")}.pdf`;
      doc.save(fileName);
      toast({ title: "PDF generated", description: `${all.length} interviews exported, grouped by field manager.` });
    } catch (err: any) {
      console.error("PDF export failed:", err);
      toast({ title: "Export failed", description: err?.message || "Could not generate PDF.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <CardTitle className="text-base sm:text-lg">Interview Breakdown</CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 sm:flex-none sm:w-56">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search folder name..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="h-9 pl-7 text-sm"
              />
            </div>
            <Button size="sm" variant="secondary" className="h-9" onClick={handleSearch}>
              Search
            </Button>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-[170px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={artifact} onValueChange={(v) => { setArtifact(v); setPage(0); }}>
              <SelectTrigger className="h-9 w-[150px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ARTIFACT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger className="h-9 w-[90px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-sm">{n}/page</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-9" onClick={handleExportPdf} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5" />}
              PDF Report
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 sm:p-6 sm:pt-0">
        <TooltipProvider delayDuration={200}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-xs py-2.5 font-semibold">Folder</TableHead>
                  <TableHead className="text-xs py-2.5 font-semibold">Informant</TableHead>
                  <TableHead className="text-xs py-2.5 font-semibold hidden md:table-cell">Field Manager</TableHead>
                  <TableHead className="text-xs py-2.5 font-semibold hidden lg:table-cell">Interviewer</TableHead>
                  <TableHead className="text-xs py-2.5 font-semibold hidden lg:table-cell">Location</TableHead>
                  <TableHead className="text-xs py-2.5 font-semibold text-right">Names</TableHead>
                  <TableHead className="text-xs py-2.5 font-semibold">Status</TableHead>
                  <TableHead className="text-xs py-2.5 font-semibold hidden sm:table-cell">Re-audit</TableHead>
                  <TableHead className="text-xs py-2.5 font-semibold hidden sm:table-cell">Artifacts</TableHead>
                  <TableHead className="text-xs py-2.5 font-semibold w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j} className="py-2.5"><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : !data || data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-10 text-sm">
                      No interviews found for this period
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => {
                    const folder = row.file_name.replace(/\.pdf$/i, "");
                    const artifacts = row.artifact_correction || [];
                    return (
                      <TableRow key={row.audit_id} className={cn("transition-colors", rowTintClass(row))}>
                        <TableCell className="py-2.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="font-mono text-xs truncate max-w-[160px] inline-block align-middle font-medium">{folder}</span>
                            </TooltipTrigger>
                            <TooltipContent><span className="font-mono text-xs">{folder}</span></TooltipContent>
                          </Tooltip>
                          <div className="text-[11px] text-muted-foreground">{format(new Date(row.uploaded_at), "MMM dd, HH:mm")}</div>
                        </TableCell>
                        <TableCell className="py-2.5 text-sm max-w-[160px] truncate">
                          {row.interviewee_name ? (
                            <Tooltip>
                              <TooltipTrigger asChild><span className="truncate block">{row.interviewee_name}</span></TooltipTrigger>
                              <TooltipContent>{row.interviewee_name}</TooltipContent>
                            </Tooltip>
                          ) : <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm hidden md:table-cell max-w-[140px] truncate">
                          {row.field_manager || <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm hidden lg:table-cell max-w-[140px] truncate">
                          {row.interviewer_name ? (
                            <div className="flex flex-col">
                              <span className="truncate">{row.interviewer_name}</span>
                              {row.interviewer_code && <span className="text-[11px] text-muted-foreground font-mono">{row.interviewer_code}</span>}
                            </div>
                          ) : <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm hidden lg:table-cell max-w-[140px] truncate">
                          {row.interview_location || <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5 text-sm text-right font-semibold tabular-nums">
                          {row.total_names ?? <span className="text-muted-foreground font-normal">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <StatusBadge row={row} />
                        </TableCell>
                        <TableCell className="py-2.5 hidden sm:table-cell">
                          {row.re_audit_count > 0 ? (
                            <Badge variant="outline" className="text-xs px-1.5 py-0.5 gap-0.5 border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300">
                              <RotateCcw className="h-3 w-3" />×{row.re_audit_count}
                            </Badge>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5 hidden sm:table-cell">
                          {artifacts.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {artifacts.map((a, i) => (
                                <span key={i} className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold", ARTIFACT_COLORS[a] || "bg-muted text-muted-foreground border-border")}>
                                  {a}
                                </span>
                              ))}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-primary/10" onClick={() => setSelected(row)}>
                            <Eye className="h-4 w-4" />
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
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t text-sm">
          <div className="text-muted-foreground">
            {totalCount > 0 ? (
              <>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount.toLocaleString()}</>
            ) : "No results"}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8" disabled={page === 0 || isLoading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <span className="text-muted-foreground whitespace-nowrap text-xs">Page {page + 1} / {Math.max(1, totalPages)}</span>
            <Button variant="outline" size="sm" className="h-8" disabled={page + 1 >= totalPages || isLoading} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-3.5 w-3.5" />
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
                  <StatusBadge row={selected} />
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

              <div className="pt-2 border-t flex justify-end">
                <Button asChild size="sm">
                  <Link to={`/review/${selected.audit_id}`}>
                    Open Audit Review <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
