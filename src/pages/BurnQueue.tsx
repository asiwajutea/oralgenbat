import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditPagination } from "@/components/AuditPagination";
import { FailedInterviewModal } from "@/components/tracking/FailedInterviewModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Flame, RotateCcw, Search, Loader2, MoreHorizontal, Trash2, Eye, Download, Users, FileText, Calendar, ChevronDown, X, ArrowUpDown, BarChart3 } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";
import { useIsMobile } from "@/hooks/use-mobile";
import { Label } from "@/components/ui/label";

const BURN_DAYS = 90;

const BurnQueue = () => {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [fmFilter, setFmFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortField, setSortField] = useState<string>("sent_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showFmAnalytics, setShowFmAnalytics] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Failed interview modal
  const [showFailedModal, setShowFailedModal] = useState(false);
  const [selectedFailedInterview, setSelectedFailedInterview] = useState<{
    id: string;
    file_name: string;
    file_url: string;
    status: string;
    reviewed_at: string | null;
    review_comment: string | null;
    action_plan: string | null;
    artifact_correction: string[] | null;
    has_metadata: boolean;
    has_pdf: boolean;
  } | null>(null);

  // Fetch burn queue items
  const { data, isLoading } = useQuery({
    queryKey: ["burn-queue", currentPage, itemsPerPage, searchTerm, statusFilter, sortField, sortOrder],
    queryFn: async () => {
      let query = supabase
        .from("burn_queue")
        .select("*", { count: "exact" })
        .order(sortField as any, { ascending: sortOrder === "asc" });

      if (statusFilter === "active") {
        query = query.is("restored_at", null);
      } else if (statusFilter === "restored") {
        query = query.not("restored_at", "is", null);
      }

      if (searchTerm) {
        query = query.ilike("file_name", `%${searchTerm}%`);
      }

      if (startDate) {
        query = query.gte("sent_at", new Date(startDate).toISOString());
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte("sent_at", end.toISOString());
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      const { data: items, count, error } = await query.range(from, to);

      if (error) throw error;
      return { items: items || [], totalCount: count || 0 };
    },
  });

  // Fetch metadata for burned items
  const burnedAuditIds = useMemo(() => data?.items.map(i => i.audit_id) || [], [data]);
  const { data: metadataMap = new Map() } = useQuery({
    queryKey: ["burn-queue-metadata", burnedAuditIds],
    queryFn: async () => {
      if (burnedAuditIds.length === 0) return new Map();
      const { data: meta } = await supabase
        .from("interview_metadata")
        .select("audit_id, total_names, field_manager, interviewee_phone")
        .in("audit_id", burnedAuditIds);
      return new Map((meta || []).map(m => [m.audit_id, m]));
    },
    enabled: burnedAuditIds.length > 0,
  });

  // Fetch all active burned items for stats (not paginated)
  const { data: allBurnedStats } = useQuery({
    queryKey: ["burn-queue-stats"],
    queryFn: async () => {
      const { data: allBurned } = await supabase
        .from("burn_queue")
        .select("audit_id, file_name")
        .is("restored_at", null);
      
      const ids = (allBurned || []).map(b => b.audit_id);
      let totalNames = 0;
      const fmCounts: Record<string, { count: number; names: number }> = {};
      
      if (ids.length > 0) {
        const batchSize = 200;
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);
          const { data: meta } = await supabase
            .from("interview_metadata")
            .select("audit_id, total_names, field_manager")
            .in("audit_id", batch);
          if (meta) {
            meta.forEach(m => {
              totalNames += m.total_names || 0;
              const fm = m.field_manager?.trim() || "Not Assigned";
              // Normalize: title-case for consistent grouping
              const fmKey = fm === "Not Assigned" ? fm : fm.replace(/\s+/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
              if (!fmCounts[fmKey]) fmCounts[fmKey] = { count: 0, names: 0 };
              fmCounts[fmKey].count++;
              fmCounts[fmKey].names += m.total_names || 0;
            });
          }
        }
      }

      const totalCount = allBurned?.length || 0;
      const uniqueFms = Object.keys(fmCounts).length;
      
      // Average days remaining
      let avgDays = 0;
      if (allBurned && allBurned.length > 0) {
        // We need sent_at for this - re-fetch with it
        const { data: withDates } = await supabase
          .from("burn_queue")
          .select("sent_at")
          .is("restored_at", null);
        if (withDates) {
          const totalDaysRemaining = withDates.reduce((sum, item) => {
            const daysSince = differenceInDays(new Date(), new Date(item.sent_at));
            return sum + Math.max(0, BURN_DAYS - daysSince);
          }, 0);
          avgDays = Math.round(totalDaysRemaining / withDates.length);
        }
      }

      return { totalCount, totalNames, uniqueFms, avgDays, fmCounts };
    },
  });

  // Resolve sender names
  const senderIds = [...new Set(data?.items.map((i) => i.sent_by) || [])];
  const { data: senderProfiles = [] } = useQuery({
    queryKey: ["burn-queue-senders", senderIds],
    queryFn: async () => {
      if (senderIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", senderIds);
      return data || [];
    },
    enabled: senderIds.length > 0,
  });

  const senderMap = new Map(senderProfiles.map((p) => [p.id, p.full_name]));

  // Fetch canonical FM list from profiles + user_roles
  const { data: canonicalFms = [] } = useQuery({
    queryKey: ["canonical-field-managers"],
    queryFn: async () => {
      const { data: fmRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "field_manager");
      if (!fmRoles?.length) return [];
      const fmIds = fmRoles.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", fmIds);
      return (profiles || []).sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

  // Filter by FM (client-side since we already have metadata)
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    if (fmFilter === "all") return data.items;
    if (fmFilter === "not_assigned") {
      return data.items.filter(item => {
        const meta = metadataMap.get(item.audit_id);
        return !meta?.field_manager || meta.field_manager.trim() === "";
      });
    }
    // Case-insensitive matching against selected FM name
    const filterLower = fmFilter.toLowerCase();
    return data.items.filter(item => {
      const meta = metadataMap.get(item.audit_id);
      return meta?.field_manager?.toLowerCase().trim() === filterLower;
    });
  }, [data?.items, fmFilter, metadataMap]);

  const restoreMutation = useMutation({
    mutationFn: async (burnId: string) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("burn_queue")
        .update({ restored_at: new Date().toISOString(), restored_by: user.id })
        .eq("id", burnId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Interview restored" });
      queryClient.invalidateQueries({ queryKey: ["burn-queue"] });
      queryClient.invalidateQueries({ queryKey: ["burn-queue-stats"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
      setSelectedIds(new Set());
    },
    onError: (error: any) => {
      toast({ title: "Failed to restore", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (burnId: string) => {
      // Get audit_id first
      const { data: burnItem } = await supabase
        .from("burn_queue")
        .select("audit_id")
        .eq("id", burnId)
        .single();
      if (!burnItem) throw new Error("Item not found");

      const auditId = burnItem.audit_id;

      // Delete burn_queue FIRST (references audits)
      await supabase.from("burn_queue").delete().eq("id", burnId);

      // Delete all related records (cascade)
      await supabase.from("audit_checklist_progress").delete().eq("audit_id", auditId);
      await supabase.from("artifact_comment_reads").delete().in("comment_id",
        (await supabase.from("artifact_correction_comments").select("id").eq("audit_id", auditId)).data?.map(c => c.id) || []
      );
      await supabase.from("artifact_correction_comments").delete().eq("audit_id", auditId);
      await supabase.from("re_audit_submissions").delete().eq("audit_id", auditId);
      await supabase.from("interview_assignments").delete().eq("audit_id", auditId);
      await supabase.from("sms_notification_logs").delete().eq("audit_id", auditId);
      await supabase.from("payment_records").delete().eq("audit_id", auditId);
      await supabase.from("audit_file_cleanup_log").delete().eq("audit_id", auditId);
      await supabase.from("interview_photos").delete().eq("audit_id", auditId);
      await supabase.from("interview_metadata").delete().eq("audit_id", auditId);

      // Delete the audit last
      const { error } = await supabase.from("audits").delete().eq("id", auditId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Interview permanently deleted" });
      queryClient.invalidateQueries({ queryKey: ["burn-queue"] });
      queryClient.invalidateQueries({ queryKey: ["burn-queue-stats"] });
      setSelectedIds(new Set());
      setDeleteTarget(null);
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  // Bulk actions with proper error handling
  const handleBulkRestore = async () => {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map(id => restoreMutation.mutateAsync(id)));
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed > 0) {
      toast({ title: `Restored ${ids.length - failed} of ${ids.length}`, description: `${failed} failed`, variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map(id => deleteMutation.mutateAsync(id)));
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed > 0) {
      toast({ title: `Deleted ${ids.length - failed} of ${ids.length}`, description: `${failed} failed`, variant: "destructive" });
    }
    setShowBulkDeleteConfirm(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const handleViewDetails = async (item: { id: string; audit_id: string; file_name: string; reason: string; sent_at: string; sent_by: string; restored_at: string | null }) => {
    const { data: audit } = await supabase
      .from("audits")
      .select("*")
      .eq("id", item.audit_id)
      .single();
    if (audit) {
      setSelectedFailedInterview({
        id: audit.id,
        file_name: audit.file_name,
        file_url: audit.file_url,
        status: audit.status,
        reviewed_at: audit.reviewed_at,
        review_comment: audit.review_comment,
        action_plan: audit.action_plan,
        artifact_correction: audit.artifact_correction,
        has_metadata: false,
        has_pdf: !!audit.file_url,
      });
      setShowFailedModal(true);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("active");
    setFmFilter("all");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  };

  const hasActiveFilters = searchTerm || statusFilter !== "active" || fmFilter !== "all" || startDate || endDate;

  // PDF Export
  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      // Fetch all active burn queue items respecting filters
      let query = supabase.from("burn_queue").select("*").is("restored_at", null).order("sent_at", { ascending: false });
      if (searchTerm) query = query.ilike("file_name", `%${searchTerm}%`);
      if (startDate) query = query.gte("sent_at", new Date(startDate).toISOString());
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte("sent_at", end.toISOString());
      }
      const { data: allItems } = await query;
      if (!allItems?.length) { toast({ title: "No data to export" }); return; }

      // Fetch metadata
      const ids = allItems.map(i => i.audit_id);
      const { data: metaAll } = await supabase.from("interview_metadata").select("audit_id, total_names, field_manager").in("audit_id", ids);
      const metaMapAll = new Map((metaAll || []).map(m => [m.audit_id, m]));

      // Fetch sender names
      const sIds = [...new Set(allItems.map(i => i.sent_by))];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", sIds);
      const sMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

      let items = allItems;
      if (fmFilter === "not_assigned") {
        items = items.filter(i => {
          const fm = metaMapAll.get(i.audit_id)?.field_manager;
          return !fm || fm.trim() === "";
        });
      } else if (fmFilter !== "all") {
        const filterLower = fmFilter.toLowerCase();
        items = items.filter(i => metaMapAll.get(i.audit_id)?.field_manager?.toLowerCase().trim() === filterLower);
      }

      const doc = new jsPDF();
      const margin = 14;
      const pageWidth = doc.internal.pageSize.getWidth();
      let pageNum = 1;

      const addHeader = (first: boolean) => {
        if (!first) { doc.setFontSize(8); doc.text(`Page ${pageNum}`, pageWidth - margin, 10, { align: "right" }); }
        doc.setFontSize(first ? 16 : 10);
        doc.setFont("helvetica", "bold");
        if (first) doc.text("Burn Queue Report", margin, 20);
      };

      addHeader(true);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${format(new Date(), "PPp")} | Total: ${items.length} interviews`, margin, 28);
      let y = 36;

      items.forEach((item, i) => {
        if (y > 275) { doc.addPage(); pageNum++; addHeader(false); y = 18; }
        const meta = metaMapAll.get(item.audit_id);
        const daysSince = differenceInDays(new Date(), new Date(item.sent_at));
        const daysRemaining = Math.max(0, BURN_DAYS - daysSince);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(`${i + 1}. ${item.file_name}`, margin, y);
        y += 4.5;
        doc.setFont("helvetica", "normal");
        doc.text(`Sent by: ${sMap.get(item.sent_by) || "Unknown"} | Sent: ${format(new Date(item.sent_at), "PPp")} | Days Remaining: ${daysRemaining}`, margin, y);
        y += 4.5;
        doc.text(`FM: ${meta?.field_manager || "-"} | Names: ${meta?.total_names || "-"} | Reason: ${item.reason}`, margin, y);
        y += 6;
      });

      doc.save(`burn-queue-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages = Math.ceil((data?.totalCount || 0) / itemsPerPage);

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container py-4 sm:py-8 px-4 sm:px-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Flame className="h-7 w-7 sm:h-8 sm:w-8 text-orange-500" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Burn Queue</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Interviews scheduled for permanent deletion after {BURN_DAYS} days
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportToPDF} disabled={isExporting} className="gap-1">
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isMobile ? "PDF" : "Export PDF"}
            </Button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Flame className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total Burned</p>
                <p className="text-lg sm:text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {allBurnedStats?.totalCount || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total Names</p>
                <p className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {(allBurnedStats?.totalNames || 0).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Field Managers</p>
                <p className="text-lg sm:text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {allBurnedStats?.uniqueFms || 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Avg Days Left</p>
                <p className="text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {allBurnedStats?.avgDays || 0}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* FM Analytics */}
        {allBurnedStats?.fmCounts && Object.keys(allBurnedStats.fmCounts).length > 0 && (
          <Collapsible open={showFmAnalytics} onOpenChange={setShowFmAnalytics}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="gap-2 w-full sm:w-auto">
                <BarChart3 className="h-4 w-4" />
                Field Manager Breakdown
                <ChevronDown className={`h-4 w-4 transition-transform ${showFmAnalytics ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field Manager</TableHead>
                          <TableHead className="text-right">Interviews</TableHead>
                          <TableHead className="text-right">Total Names</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(allBurnedStats.fmCounts)
                          .sort((a, b) => b[1].count - a[1].count)
                          .map(([fm, stats]) => (
                            <TableRow key={fm}>
                              <TableCell className="font-medium">{fm}</TableCell>
                              <TableCell className="text-right">{stats.count}</TableCell>
                              <TableCell className="text-right">{stats.names.toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by file name..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="pl-9"
            />
            {searchTerm && (
              <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0" onClick={() => setSearchTerm("")}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="restored">Restored</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fmFilter} onValueChange={(v) => { setFmFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Field Manager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Managers</SelectItem>
              <SelectItem value="not_assigned">Not Assigned</SelectItem>
              {canonicalFms.map(fm => (
                <SelectItem key={fm.id} value={fm.full_name}>{fm.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isMobile && (
            <>
              <div>
                <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }} className="w-36" placeholder="Start date" />
              </div>
              <div>
                <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }} className="w-36" placeholder="End date" />
              </div>
            </>
          )}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>

        {/* Bulk Actions */}
        {isAdmin && selectedIds.size > 0 && (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" onClick={handleBulkRestore} disabled={restoreMutation.isPending} className="gap-1">
              <RotateCcw className="h-3 w-3" /> Restore
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setShowBulkDeleteConfirm(true)} disabled={deleteMutation.isPending} className="gap-1">
              <Trash2 className="h-3 w-3" /> Delete
            </Button>
          </div>
        )}

        {/* Table / Mobile Cards */}
        <Card>
          <CardContent className="p-0">
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No items in the burn queue
              </div>
            ) : isMobile ? (
              /* Mobile Accordion View */
              <div className="divide-y">
                <Accordion type="single" collapsible className="w-full">
                  {filteredItems.map((item, index) => {
                    const daysSinceSent = differenceInDays(new Date(), new Date(item.sent_at));
                    const daysRemaining = Math.max(0, BURN_DAYS - daysSinceSent);
                    const isRestored = !!item.restored_at;
                    const meta = metadataMap.get(item.audit_id);

                    return (
                      <AccordionItem key={item.id} value={item.id} className="border-0">
                        <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
                          <div className="flex items-center justify-between w-full gap-2 mr-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {isAdmin && (
                                <Checkbox
                                  checked={selectedIds.has(item.id)}
                                  onCheckedChange={() => toggleSelect(item.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                              <span className="font-mono text-sm font-medium truncate">
                                {item.file_name}
                              </span>
                            </div>
                            {isRestored ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 flex-shrink-0">
                                Restored
                              </Badge>
                            ) : (
                              <Badge variant={daysRemaining <= 30 ? "destructive" : "secondary"} className="flex-shrink-0">
                                {daysRemaining}d
                              </Badge>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <div className="space-y-2 text-sm">
                            <div className="grid grid-cols-2 gap-2">
                              <div><p className="text-muted-foreground text-xs">Phone</p><p className="font-medium">{meta?.interviewee_phone || "-"}</p></div>
                              <div><p className="text-muted-foreground text-xs">Sent By</p><p className="font-medium">{senderMap.get(item.sent_by) || "Unknown"}</p></div>
                              <div><p className="text-muted-foreground text-xs">Sent At</p><p className="font-medium">{format(new Date(item.sent_at), "PP")}</p></div>
                              <div><p className="text-muted-foreground text-xs">FM</p><p className="font-medium">{meta?.field_manager || "-"}</p></div>
                              <div><p className="text-muted-foreground text-xs">Names</p><p className="font-medium">{meta?.total_names || "-"}</p></div>
                            </div>
                            <div><p className="text-muted-foreground text-xs">Reason</p><p className="font-medium">{item.reason}</p></div>
                            {isAdmin && !isRestored && (
                              <div className="flex gap-2 pt-2">
                                <Button size="sm" variant="outline" onClick={() => restoreMutation.mutate(item.id)} disabled={restoreMutation.isPending} className="gap-1">
                                  <RotateCcw className="h-3 w-3" /> Restore
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleViewDetails(item)} className="gap-1">
                                  <Eye className="h-3 w-3" /> View
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => { setDeleteTarget(item.id); setShowDeleteConfirm(true); }} className="gap-1">
                                  <Trash2 className="h-3 w-3" /> Delete
                                </Button>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            ) : (
              /* Desktop Table View */
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isAdmin && (
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                      )}
                      <TableHead className="w-12">SN</TableHead>
                      <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("file_name")}>
                        <div className="flex items-center gap-1">File Name <ArrowUpDown className="h-3 w-3" /></div>
                      </TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Sent By</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>FM</TableHead>
                      <TableHead className="text-right">Names</TableHead>
                      <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("sent_at")}>
                        <div className="flex items-center gap-1">Sent At <ArrowUpDown className="h-3 w-3" /></div>
                      </TableHead>
                      <TableHead>Days Left</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10 sticky right-0 bg-background"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item, index) => {
                      const daysSinceSent = differenceInDays(new Date(), new Date(item.sent_at));
                      const daysRemaining = Math.max(0, BURN_DAYS - daysSinceSent);
                      const isRestored = !!item.restored_at;
                      const meta = metadataMap.get(item.audit_id);

                      return (
                        <TableRow key={item.id}>
                          {isAdmin && (
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(item.id)}
                                onCheckedChange={() => toggleSelect(item.id)}
                              />
                            </TableCell>
                          )}
                          <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                          <TableCell className="font-mono text-sm font-medium">{item.file_name}</TableCell>
                          <TableCell className="text-sm">{meta?.interviewee_phone || "-"}</TableCell>
                          <TableCell className="text-sm">{senderMap.get(item.sent_by) || "Unknown"}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate" title={item.reason}>{item.reason}</TableCell>
                          <TableCell className="text-sm">{meta?.field_manager || "-"}</TableCell>
                          <TableCell className="text-right text-sm">{meta?.total_names || "-"}</TableCell>
                          <TableCell className="text-sm">{format(new Date(item.sent_at), "PPp")}</TableCell>
                          <TableCell>
                            {isRestored ? (
                              <span className="text-sm text-muted-foreground">-</span>
                            ) : (
                              <Badge variant={daysRemaining <= 30 ? "destructive" : "secondary"}>
                                {daysRemaining} days
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {isRestored ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">
                                Restored
                              </Badge>
                            ) : (
                              <Badge variant="destructive">Ready to Burn</Badge>
                            )}
                          </TableCell>
                          <TableCell className="sticky right-0 bg-background">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewDetails(item)}>
                                  <Eye className="h-4 w-4 mr-2" /> View Details
                                </DropdownMenuItem>
                                {isAdmin && !isRestored && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => restoreMutation.mutate(item.id)}>
                                      <RotateCcw className="h-4 w-4 mr-2" /> Restore
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => { setDeleteTarget(item.id); setShowDeleteConfirm(true); }}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" /> Delete Permanently
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <AuditPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={data?.totalCount || 0}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(v) => { setItemsPerPage(v); setCurrentPage(1); }}
        />
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Interview?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the interview and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} Interviews?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all selected interviews and their associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
            >
              Delete All Selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Failed Interview Modal */}
      {selectedFailedInterview && (
        <FailedInterviewModal
          open={showFailedModal}
          onOpenChange={setShowFailedModal}
          interview={selectedFailedInterview}
        />
      )}
    </div>
  );
};

export default BurnQueue;
