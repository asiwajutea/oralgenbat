import { useState, useEffect } from "react";
import { Filter } from "lucide-react";
import { FilterSidebar, FilterState } from "@/components/FilterSidebar";
import { AuditTable } from "@/components/AuditTable";
import { UploadDialog } from "@/components/UploadDialog";
import { AuditPagination } from "@/components/AuditPagination";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Audit {
  id: string;
  file_name: string;
  file_url: string;
  status: "Pending" | "Audit Passed" | "Audit Failed";
  uploaded_at: string;
  last_modified: string;
}

const Index = () => {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    statuses: [],
    interviewId: "",
    startDate: "",
    endDate: "",
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 10;

  const fetchAudits = async () => {
    try {
      setIsLoading(true);
      let query = supabase
        .from("audits")
        .select("*", { count: "exact" });

      // Apply filters to query
      if (filters.statuses.length > 0) {
        query = query.in("status", filters.statuses as Audit["status"][]);
      }
      if (filters.interviewId) {
        query = query.ilike("file_name", `%${filters.interviewId}%`);
      }
      if (filters.startDate) {
        query = query.gte("last_modified", filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte("last_modified", filters.endDate);
      }

      // Add pagination and ordering
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      
      const { data, error, count } = await query
        .order("last_modified", { ascending: false })
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
  }, [currentPage, filters]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

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
        {/* Header */}
        <header className="border-b bg-card px-6 py-4">
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
        </header>

        {/* Table Content */}
        <main className="flex-1 p-6 flex flex-col">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading audits...</p>
            </div>
          ) : (
            <>
              <AuditTable audits={audits} />
              <AuditPagination
                currentPage={currentPage}
                totalPages={Math.ceil(totalCount / itemsPerPage)}
                totalCount={totalCount}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </main>
      </div>

      {/* Desktop Filter Sidebar */}
      <div className="hidden lg:block">
        <FilterSidebar onFilterChange={setFilters} />
      </div>
    </div>
  );
};

export default Index;
