import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { format } from "date-fns";
import { 
  MessageSquare, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Users,
  RefreshCw,
  Search,
  Eye,
  Filter,
  CalendarIcon,
  ArrowUpDown,
  X,
  FileDown,
  Loader2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AuditPagination } from "@/components/AuditPagination";
import { fetchAllRows } from "@/utils/paginatedFetch";
import jsPDF from "jspdf";
import { toast } from "sonner";

interface SmsLog {
  id: string;
  audit_id: string | null;
  file_name: string | null;
  interviewer_code: string | null;
  contractor_id: string | null;
  recipients: string[];
  recipients_count: number;
  message: string;
  status: string;
  provider_response: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export default function SmsLogs() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<SmsLog | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [sortField, setSortField] = useState<"created_at" | "recipients_count">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [contractorFilter, setContractorFilter] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery, dateFrom, dateTo, contractorFilter, sortField, sortOrder]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== "all") count++;
    if (searchQuery) count++;
    if (dateFrom) count++;
    if (dateTo) count++;
    if (contractorFilter) count++;
    return count;
  }, [statusFilter, searchQuery, dateFrom, dateTo, contractorFilter]);

  // Clear all filters
  const clearFilters = () => {
    setStatusFilter("all");
    setSearchQuery("");
    setDateFrom(undefined);
    setDateTo(undefined);
    setContractorFilter("");
  };

  // Build filter function for reuse
  const applyFilters = (query: any) => {
    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (dateFrom) {
      query = query.gte("created_at", dateFrom.toISOString());
    }
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte("created_at", endOfDay.toISOString());
    }
    if (contractorFilter) {
      query = query.eq("contractor_id", contractorFilter);
    }
    if (searchQuery) {
      query = query.or(`file_name.ilike.%${searchQuery}%,interviewer_code.ilike.%${searchQuery}%,contractor_id.ilike.%${searchQuery}%`);
    }
    return query;
  };

  // Count query for pagination
  const { data: totalCount = 0 } = useQuery({
    queryKey: ["sms-logs-count", statusFilter, searchQuery, dateFrom, dateTo, contractorFilter],
    queryFn: async () => {
      let query = supabase
        .from("sms_notification_logs")
        .select("id", { count: "exact", head: true });
      query = applyFilters(query);
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
  });

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["sms-logs", statusFilter, searchQuery, dateFrom, dateTo, contractorFilter, sortField, sortOrder, currentPage, itemsPerPage],
    queryFn: async () => {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      let query = supabase
        .from("sms_notification_logs")
        .select("*")
        .order(sortField, { ascending: sortOrder === "asc" })
        .range(from, to);

      query = applyFilters(query);

      const { data, error } = await query;
      if (error) throw error;
      return data as SmsLog[];
    },
  });
  
  // Get unique contractor IDs for filter dropdown
  const { data: contractorIds = [] } = useQuery({
    queryKey: ["sms-contractor-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_notification_logs")
        .select("contractor_id");
      
      if (error) throw error;
      const unique = [...new Set((data || []).map(d => d.contractor_id).filter(Boolean))];
      return unique as string[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["sms-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_notification_logs")
        .select("status");
      
      if (error) throw error;
      
      const total = data.length;
      const sent = data.filter(l => l.status === "sent").length;
      const failed = data.filter(l => l.status === "failed" || l.status === "error").length;
      const noRecipients = data.filter(l => l.status === "no_recipients").length;
      
      return { total, sent, failed, noRecipients };
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-emerald-500/90 hover:bg-emerald-600/90 text-white"><CheckCircle className="w-3 h-3 mr-1" /> Sent</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case "error":
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Error</Badge>;
      case "no_recipients":
        return <Badge variant="secondary"><Users className="w-3 h-3 mr-1" /> No Recipients</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // PDF report generation
  const generatePdfReport = async () => {
    setIsGeneratingPdf(true);
    try {
      const allLogs = await fetchAllRows(
        "sms_notification_logs",
        "*",
        (q: any) => {
          let query = applyFilters(q);
          return query.order("created_at", { ascending: false });
        }
      ) as SmsLog[];

      if (allLogs.length === 0) {
        toast.error("No SMS logs to include in the report");
        return;
      }

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      const usable = pageWidth - margin * 2;
      let y = 20;

      const checkPage = (needed: number) => {
        if (y + needed > doc.internal.pageSize.getHeight() - 15) {
          doc.addPage();
          y = 15;
        }
      };

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("SMS Notification Report", margin, y);
      y += 8;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const filterParts: string[] = [];
      if (dateFrom) filterParts.push(`From: ${format(dateFrom, "PP")}`);
      if (dateTo) filterParts.push(`To: ${format(dateTo, "PP")}`);
      if (contractorFilter) filterParts.push(`Contractor: ${contractorFilter}`);
      if (statusFilter !== "all") filterParts.push(`Status: ${statusFilter}`);
      if (searchQuery) filterParts.push(`Search: ${searchQuery}`);
      doc.text(`Generated: ${format(new Date(), "PPpp")}${filterParts.length ? " | " + filterParts.join(", ") : ""}`, margin, y);
      y += 4;
      doc.text(`Total Records: ${allLogs.length}`, margin, y);
      y += 10;

      // --- Section 1: Contractor Summary ---
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("1. Contractor Summary", margin, y);
      y += 7;

      const byContractor = new Map<string, { total: number; sent: number; failed: number }>();
      allLogs.forEach(log => {
        const cid = log.contractor_id || "Unknown";
        const entry = byContractor.get(cid) || { total: 0, sent: 0, failed: 0 };
        entry.total++;
        if (log.status === "sent") entry.sent++;
        if (log.status === "failed" || log.status === "error") entry.failed++;
        byContractor.set(cid, entry);
      });

      // Table header
      const cols1 = [margin, margin + usable * 0.4, margin + usable * 0.6, margin + usable * 0.8];
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y - 4, usable, 6, "F");
      doc.text("Contractor", cols1[0] + 2, y);
      doc.text("Total", cols1[1] + 2, y);
      doc.text("Sent", cols1[2] + 2, y);
      doc.text("Failed", cols1[3] + 2, y);
      y += 5;
      doc.setFont("helvetica", "normal");

      let grandTotal = 0, grandSent = 0, grandFailed = 0;
      byContractor.forEach((val, key) => {
        checkPage(6);
        doc.text(key, cols1[0] + 2, y);
        doc.text(String(val.total), cols1[1] + 2, y);
        doc.text(String(val.sent), cols1[2] + 2, y);
        doc.text(String(val.failed), cols1[3] + 2, y);
        grandTotal += val.total;
        grandSent += val.sent;
        grandFailed += val.failed;
        y += 5;
      });

      // Grand total row
      checkPage(6);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(230, 230, 230);
      doc.rect(margin, y - 4, usable, 6, "F");
      doc.text("ALL", cols1[0] + 2, y);
      doc.text(String(grandTotal), cols1[1] + 2, y);
      doc.text(String(grandSent), cols1[2] + 2, y);
      doc.text(String(grandFailed), cols1[3] + 2, y);
      y += 12;

      // --- Section 2: Interviewer Summary ---
      checkPage(20);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("2. Interviewer Summary", margin, y);
      y += 7;

      const byInterviewer = new Map<string, number>();
      allLogs.forEach(log => {
        const code = log.interviewer_code || "Unknown";
        byInterviewer.set(code, (byInterviewer.get(code) || 0) + 1);
      });

      const cols2 = [margin, margin + usable * 0.6];
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y - 4, usable, 6, "F");
      doc.text("Interviewer Code", cols2[0] + 2, y);
      doc.text("Total SMS", cols2[1] + 2, y);
      y += 5;
      doc.setFont("helvetica", "normal");

      const sortedInterviewers = [...byInterviewer.entries()].sort((a, b) => b[1] - a[1]);
      sortedInterviewers.forEach(([code, count]) => {
        checkPage(6);
        doc.text(code, cols2[0] + 2, y);
        doc.text(String(count), cols2[1] + 2, y);
        y += 5;
      });
      y += 8;

      // --- Section 3: Detailed Breakdown ---
      checkPage(20);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("3. Detailed Breakdown by Interviewer", margin, y);
      y += 7;

      // Group by interviewer
      const detailByInterviewer = new Map<string, SmsLog[]>();
      allLogs.forEach(log => {
        const code = log.interviewer_code || "Unknown";
        if (!detailByInterviewer.has(code)) detailByInterviewer.set(code, []);
        detailByInterviewer.get(code)!.push(log);
      });

      const cols3 = [margin, margin + usable * 0.5, margin + usable * 0.8];
      detailByInterviewer.forEach((interviewerLogs, code) => {
        checkPage(14);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(`Interviewer: ${code} (${interviewerLogs.length} SMS)`, margin, y);
        y += 5;

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, y - 3.5, usable, 5, "F");
        doc.text("Interview (File Name)", cols3[0] + 2, y);
        doc.text("Date/Time", cols3[1] + 2, y);
        doc.text("Status", cols3[2] + 2, y);
        y += 4.5;
        doc.setFont("helvetica", "normal");

        interviewerLogs.forEach(log => {
          checkPage(5);
          const fileName = log.file_name || "-";
          const truncatedName = fileName.length > 35 ? fileName.substring(0, 32) + "..." : fileName;
          doc.text(truncatedName, cols3[0] + 2, y);
          doc.text(format(new Date(log.created_at), "MMM d, yyyy HH:mm"), cols3[1] + 2, y);
          doc.text(log.status, cols3[2] + 2, y);
          y += 4.5;
        });
        y += 4;
      });

      doc.save(`sms-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("PDF report downloaded");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("Failed to generate PDF report");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SMS Notification Logs</h1>
          <p className="text-muted-foreground">Track all SMS notifications sent for failed audits</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={generatePdfReport} variant="outline" size="sm" disabled={isGeneratingPdf}>
            {isGeneratingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
            PDF Report
          </Button>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total SMS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <span className="text-2xl font-bold">{stats?.total || 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sent Successfully</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <span className="text-2xl font-bold">{stats?.sent || 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="text-2xl font-bold">{stats?.failed || 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">No Recipients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats?.noRecipients || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search by file name, interviewer code, or contractor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="no_recipients">No Recipients</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                onClick={() => setShowFilters(!showFilters)}
                className="gap-2"
              >
                <Filter className="w-4 h-4" />
                More Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>
                )}
              </Button>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                  <X className="w-4 h-4" />
                  Clear
                </Button>
              )}
            </div>

            {/* Collapsible Advanced Filters */}
            <Collapsible open={showFilters} onOpenChange={setShowFilters}>
              <CollapsibleContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
                  {/* Date From */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date From</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateFrom ? format(dateFrom, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={setDateFrom}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Date To */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date To</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateTo ? format(dateTo, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={setDateTo}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Contractor Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Contractor</label>
                    <Select value={contractorFilter || "all"} onValueChange={(v) => setContractorFilter(v === "all" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="All contractors" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All contractors</SelectItem>
                        {contractorIds.map(id => (
                          <SelectItem key={id} value={id}>{id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sort */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Sort By</label>
                    <div className="flex gap-2">
                      <Select value={sortField} onValueChange={(v) => setSortField(v as "created_at" | "recipients_count")}>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="created_at">Date</SelectItem>
                          <SelectItem value="recipients_count">Recipients</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
                      >
                        <ArrowUpDown className={`h-4 w-4 ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                      </Button>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
              <p>No SMS logs found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead>Interviewer</TableHead>
                  <TableHead>Contractor</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(log.created_at), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {log.file_name || "-"}
                    </TableCell>
                    <TableCell>{log.interviewer_code || "-"}</TableCell>
                    <TableCell>{log.contractor_id || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.recipients_count}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedLog(log)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>SMS Log Details</DialogTitle>
                            </DialogHeader>
                            {selectedLog && (
                              <div className="space-y-4">
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                                  <div className="mt-1">{getStatusBadge(selectedLog.status)}</div>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Time</label>
                                  <p>{format(new Date(selectedLog.created_at), "PPpp")}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">File Name</label>
                                  <p>{selectedLog.file_name || "-"}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Message</label>
                                  <p className="text-sm bg-muted p-3 rounded-md mt-1">{selectedLog.message || "-"}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Recipients ({selectedLog.recipients_count})</label>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {selectedLog.recipients.length > 0 ? (
                                      selectedLog.recipients.map((phone, i) => (
                                        <Badge key={i} variant="secondary">{phone}</Badge>
                                      ))
                                    ) : (
                                      <span className="text-muted-foreground">No recipients</span>
                                    )}
                                  </div>
                                </div>
                                {selectedLog.error_message && (
                                  <div>
                                    <label className="text-sm font-medium text-destructive">Error</label>
                                    <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md mt-1">
                                      {selectedLog.error_message}
                                    </p>
                                  </div>
                                )}
                                {selectedLog.provider_response && (
                                  <div>
                                    <label className="text-sm font-medium text-muted-foreground">Provider Response</label>
                                    <pre className="text-xs bg-muted p-3 rounded-md mt-1 overflow-auto max-h-32">
                                      {JSON.stringify(selectedLog.provider_response, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {selectedLog.audit_id && (
                                  <Button 
                                    variant="outline" 
                                    className="w-full"
                                    onClick={() => navigate(`/review/${selectedLog.audit_id}`)}
                                  >
                                    View Interview
                                  </Button>
                                )}
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 0 && (
        <AuditPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(val) => {
            setItemsPerPage(val);
            setCurrentPage(1);
          }}
        />
      )}
    </div>
  );
}
