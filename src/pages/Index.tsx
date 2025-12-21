import { useState, useEffect } from "react";
import { Filter } from "lucide-react";
import { FilterSidebar, FilterState } from "@/components/FilterSidebar";
import { AuditTable } from "@/components/AuditTable";
import { UploadDialog } from "@/components/UploadDialog";
import { AuditPagination } from "@/components/AuditPagination";
import { AuditorStatsCard } from "@/components/AuditorStatsCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

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
  const { userRole } = useAuth();
  const [audits, setAudits] = useState<Audit[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    statuses: [],
    interviewId: "",
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
  
  const hideReviewButton = userRole === 'field_manager' || userRole === 'contractor';

  const fetchAudits = async () => {
    try {
      setIsLoading(true);
      let query = supabase
        .from("audits")
        .select("*", { count: "exact" });

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Apply filters to query
      if (filters.statuses.length > 0) {
        // Handle "In Progress" filter separately
        if (filters.statuses.includes("In Progress")) {
          const otherStatuses = filters.statuses.filter(s => s !== "In Progress");
          if (otherStatuses.length > 0) {
            // Complex OR filter: In Progress OR other statuses
            query = query.or(
              `and(locked_by.not.is.null,locked_at.gte.${oneHourAgo}),status.in.(${otherStatuses.join(",")})`
            );
          } else {
            // Only In Progress filter
            query = query
              .not("locked_by", "is", null)
              .gte("locked_at", oneHourAgo);
          }
        } else {
          query = query.in("status", filters.statuses as Array<Audit["status"]>);
        }
      }
      if (filters.interviewId) {
        query = query.ilike("file_name", `%${filters.interviewId}%`);
      }
      if (filters.reviewer) {
        query = query.ilike("reviewed_by", `%${filters.reviewer}%`);
      }
      if (filters.interviewerId) {
        // Extract interviewer ID from file_name pattern: NG71_704_20251013_1000 -> 704
        query = query.ilike("file_name", `%_${filters.interviewerId}_%`);
      }
      if (filters.startDate) {
        query = query.gte("uploaded_at", filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte("uploaded_at", filters.endDate);
      }

      // Add pagination and ordering
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      
      const { data, error, count } = await query
        .order("uploaded_at", { ascending: false })
        .range(from, to);

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
  }, [currentPage, filters, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Reset to page 1 when items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Mobile Filter Sidebar */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setIsFilterOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-[336px] shadow-lg z-50">
            <FilterSidebar onFilterChange={setFilters} onClose={() => setIsFilterOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Page Header */}
        <div className="border-b bg-card px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                onClick={() => setIsFilterOpen(true)}
              >
                <Filter className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Interviews</h1>
                <p className="text-sm text-muted-foreground">
                  {totalCount} {totalCount === 1 ? "result" : "results"}
                </p>
              </div>
            </div>
            <UploadDialog onUploadComplete={fetchAudits} />
          </div>
        </div>

        {/* Table Content */}
        <main className="flex-1 p-6 flex flex-col">
          {/* Auditor Stats Cards */}
          <AuditorStatsCard />
          
          {isLoading ? (
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
    </div>
  );
};

export default Index;
