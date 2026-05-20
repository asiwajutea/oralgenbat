import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Filter, Upload, ChevronDown, FileText, FileArchive, Files } from "lucide-react";
import { FilterSidebar, FilterState } from "@/components/FilterSidebar";
import { AuditTable } from "@/components/AuditTable";
import { UploadDialog } from "@/components/UploadDialog";
import { BulkZipUploadDialog } from "@/components/BulkZipUploadDialog";
import { CombinedUploadDialog } from "@/components/CombinedUploadDialog";
import { UploadLockGuard } from "@/components/upload/UploadLockGuard";
import { AuditPagination } from "@/components/AuditPagination";
import { AuditorStatsCard } from "@/components/AuditorStatsCard";
import { AdminStatsCard } from "@/components/AdminStatsCard";
import { OfflineTablePlaceholder } from "@/components/OfflineTablePlaceholder";
import { FloatingUploadProgress, type UploadProgressData } from "@/components/FloatingUploadProgress";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

interface Audit {
  id: string;
  file_name: string;
  file_url: string;
  status: "Pending" | "Audit Passed" | "Audit Failed" | "Awaiting Review";
  uploaded_at: string;
  last_modified: string;
  mobile_zip_url: string | null;
  mobile_zip_uploaded_at: string | null;
  reviewed_by: string | null;
  is_re_audit: boolean;
  re_audit_count: number;
  original_status: "Pending" | "Audit Passed" | "Audit Failed" | "Awaiting Review" | null;
  locked_by: string | null;
  locked_at: string | null;
}

const Index = () => {
  const { userRole, profile } = useAuth();
  const isOnline = useOnlineStatus();
  const [searchParams] = useSearchParams();
  const searchFromUrl = searchParams.get("search") || "";

  const [audits, setAudits] = useState<Audit[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    statuses: [],
    interviewId: searchFromUrl,
    reviewer: "",
    interviewerId: "",
    startDate: "",
    endDate: "",
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [bulkZipOpen, setBulkZipOpen] = useState(false);
  const [combinedUploadOpen, setCombinedUploadOpen] = useState(false);
  const [activeUpload, setActiveUpload] = useState<UploadProgressData | null>(null);
  const hideReviewButton = userRole === "field_manager" || userRole === "contractor";
  const canUpload = userRole !== "auditor"; // Auditors cannot upload files
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const isSuperAdmin = userRole === "super_admin";

  // Contractor/Auditor filtering
  // For auditors: use active_contractor_id if set, otherwise fall back to contractor_id (NG71, etc.)
  // For contractors: use their contractor_id
  const isContractor = userRole === "contractor";
  const isAuditor = userRole === "auditor";

  // Auditors use active_contractor_id if set, otherwise their own contractor_id
  // This ensures auditors with contractor_id "NG71" see NG71 interviews even without active_contractor_id
  const effectiveContractorId = isAuditor
    ? profile?.active_contractor_id || profile?.contractor_id // Auditors: prefer active, fall back to own
    : profile?.contractor_id; // Contractors: use their own contractor_id

  // Filter by contractor for contractors always, and for auditors with a valid contractor ID
  const shouldFilterByContractor = (isContractor || (isAuditor && effectiveContractorId)) && !isSuperAdmin;
  // Update filters when URL search param changes
  useEffect(() => {
    if (searchFromUrl) {
      setFilters((prev) => ({ ...prev, interviewId: searchFromUrl }));
    }
  }, [searchFromUrl]);

  const fetchAudits = async () => {
    try {
      setIsLoading(true);

      // Fetch burned audit IDs first
      const { data: burnedData } = await supabase.from("burn_queue").select("audit_id").is("restored_at", null);
      const burnedIds = new Set((burnedData || []).map((b) => b.audit_id));

      const from = (currentPage - 1) * itemsPerPage;

      const shouldSortByArtifacts =
        filters.statuses.includes("Awaiting Review") ||
        filters.statuses.includes("Ready for Review") ||
        filters.statuses.includes("Pending") ||
        filters.statuses.length === 0;

      // For contractors/auditors, use the RPC function to avoid URL length limits
      if (shouldFilterByContractor && effectiveContractorId) {
        const { data: rpcData, error: rpcError } = await supabase.rpc("get_contractor_audits", {
          p_contractor_id: effectiveContractorId,
          p_is_auditor: isAuditor,
          p_auditor_name: !isAdmin && isAuditor && profile?.full_name ? profile.full_name : null,
          p_statuses: filters.statuses.length > 0 ? filters.statuses : null,
          p_search: filters.interviewId || null,
          p_reviewer: filters.reviewer || null,
          p_interviewer: filters.interviewerId || null,
          p_start_date: filters.startDate || null,
          p_end_date: filters.endDate || null,
          p_limit: itemsPerPage + burnedIds.size, // fetch extra to account for filtering
          p_offset: from,
          p_sort_by_artifacts: shouldSortByArtifacts,
        });

        if (rpcError) throw rpcError;

        const results = (rpcData || []).filter((a: any) => !burnedIds.has(a.id));
        const total = results.length > 0 ? Math.max(0, Number(results[0]?.total_count || 0) - burnedIds.size) : 0;

        setAudits(results.slice(0, itemsPerPage) as unknown as Audit[]);
        setTotalCount(total);
        setIsLoading(false);
        return;
      }

      // For admins and other roles, use the existing direct query approach
      let query = supabase.from("audits").select("*", { count: "exact" });

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Apply filters to query
      if (filters.statuses.length > 0) {
        const hasReAudit = filters.statuses.includes("Re-Audit");
        const hasInProgress = filters.statuses.includes("In Progress");
        const hasReadyForReview = filters.statuses.includes("Ready for Review");
        const otherStatuses = filters.statuses.filter(
          (s) => s !== "In Progress" && s !== "Re-Audit" && s !== "Ready for Review",
        );

        if (hasReadyForReview && !hasReAudit && !hasInProgress && otherStatuses.length === 0) {
          query = query
            .in("status", ["Pending", "Awaiting Review"])
            .not("file_url", "is", null)
            .not("mobile_zip_url", "is", null)
            .or("is_re_audit.is.null,is_re_audit.eq.false");
        } else if (hasReAudit && !hasInProgress && !hasReadyForReview && otherStatuses.length === 0) {
          query = query.eq("is_re_audit", true).in("status", ["Pending", "Awaiting Review"]);
        } else if (hasInProgress && !hasReAudit && !hasReadyForReview && otherStatuses.length === 0) {
          query = query.not("locked_by", "is", null).gte("locked_at", oneHourAgo);
        } else if (hasInProgress || hasReAudit || hasReadyForReview) {
          const conditions = [];
          if (hasInProgress) {
            conditions.push(`and(locked_by.not.is.null,locked_at.gte.${oneHourAgo})`);
          }
          if (hasReAudit) {
            conditions.push(`and(is_re_audit.eq.true,or(status.eq.Pending,status.eq."Awaiting Review"))`);
          }
          if (hasReadyForReview) {
            conditions.push(
              `and(or(status.eq.Pending,status.eq."Awaiting Review"),file_url.not.is.null,mobile_zip_url.not.is.null,or(is_re_audit.is.null,is_re_audit.eq.false))`,
            );
          }
          if (otherStatuses.length > 0) {
            conditions.push(`status.in.(${otherStatuses.map((s) => `"${s}"`).join(",")})`);
          }
          query = query.or(conditions.join(","));
        } else {
          query = query.in("status", otherStatuses as Array<Audit["status"]>);
        }
      }
      if (filters.interviewId) {
        query = query.ilike("file_name", `%${filters.interviewId}%`);
      }
      if (filters.reviewer) {
        query = query.ilike("reviewed_by", `%${filters.reviewer}%`);
      }
      if (filters.interviewerId) {
        query = query.ilike("file_name", `%_${filters.interviewerId}_%`);
      }
      if (filters.startDate) {
        query = query.gte("uploaded_at", filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte("uploaded_at", filters.endDate);
      }

      // Exclude burned audits from direct query
      if (burnedIds.size > 0) {
        const burnedArr = Array.from(burnedIds);
        query = query.not("id", "in", `(${burnedArr.join(",")})`);
      }

      const to = from + itemsPerPage - 1;

      if (shouldSortByArtifacts) {
        query = query
          .order("mobile_zip_url", { ascending: false, nullsFirst: false })
          .order("uploaded_at", { ascending: false });
      } else {
        query = query.order("uploaded_at", { ascending: false });
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      setAudits(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching audits:", error);
      toast.error("Failed to load audits");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAudits();
  }, [currentPage, filters, itemsPerPage, effectiveContractorId]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Reset to page 1 when items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage]);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full bg-background">
      {/* Mobile Filter Sidebar */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsFilterOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-full max-w-[336px] shadow-lg z-50">
            <FilterSidebar onFilterChange={setFilters} onClose={() => setIsFilterOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Page Header */}
        <div className="border-b bg-card px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setIsFilterOpen(true)}>
                <Filter className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">Interviews</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {totalCount} {totalCount === 1 ? "result" : "results"}
                </p>
              </div>
            </div>
            {false && canUpload && (
              <UploadLockGuard>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4">
                      <Upload className="h-4 w-4" />
                      <span className="hidden xs:inline">UPLOAD</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setPdfUploadOpen(true)}>
                      <FileText className="h-4 w-4 mr-2" />
                      Upload PDFs Only
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCombinedUploadOpen(true)}>
                      <Files className="h-4 w-4 mr-2" />
                      Upload PDFs + Metadata
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBulkZipOpen(true)}>
                      <FileArchive className="h-4 w-4 mr-2" />
                      Bulk Upload ZIPs
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </UploadLockGuard>
            )}

            {/* Upload Dialogs - only render if canUpload */}
            {canUpload && (
              <>
                <UploadDialog
                  onUploadComplete={fetchAudits}
                  open={pdfUploadOpen}
                  onOpenChange={setPdfUploadOpen}
                  onUploadProgress={setActiveUpload}
                />
                <BulkZipUploadDialog onUploadComplete={fetchAudits} open={bulkZipOpen} onOpenChange={setBulkZipOpen} />
                <CombinedUploadDialog
                  onUploadComplete={fetchAudits}
                  open={combinedUploadOpen}
                  onOpenChange={setCombinedUploadOpen}
                  onUploadProgress={setActiveUpload}
                />
              </>
            )}
          </div>
        </div>

        {/* Table Content */}
        <main className="flex-1 p-4 sm:p-6 flex flex-col overflow-x-auto">
          {/* Admin Stats Cards */}
          <AdminStatsCard />

          {/* Auditor Stats Cards */}
          <AuditorStatsCard />

          {!isOnline ? (
            <OfflineTablePlaceholder />
          ) : isLoading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading audits...</p>
            </div>
          ) : (
            <>
              <AuditTable audits={audits} onRefresh={fetchAudits} hideReviewButton={hideReviewButton} />
              <AuditPagination
                currentPage={currentPage}
                totalPages={Math.ceil(totalCount / itemsPerPage)}
                totalCount={totalCount}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
              />
            </>
          )}
        </main>
      </div>

      {/* Desktop Filter Sidebar */}
      <div className="hidden lg:block sticky top-0 h-screen">
        <FilterSidebar onFilterChange={setFilters} />
      </div>
      {/* Floating Upload Progress */}
      {activeUpload && <FloatingUploadProgress {...activeUpload} onClose={() => setActiveUpload(null)} />}
    </div>
  );
};

export default Index;
