import { useState, useEffect } from "react";
import { Filter } from "lucide-react";
import { FilterSidebar, FilterState } from "@/components/FilterSidebar";
import { AuditTable } from "@/components/AuditTable";
import { UploadDialog } from "@/components/UploadDialog";
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
  const [filteredAudits, setFilteredAudits] = useState<Audit[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    statuses: [],
    interviewId: "",
    startDate: "",
    endDate: "",
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAudits = async () => {
    try {
      const { data, error } = await supabase
        .from("audits")
        .select("*")
        .order("last_modified", { ascending: false });

      if (error) throw error;
      setAudits(data || []);
      setFilteredAudits(data || []);
    } catch (error) {
      console.error("Error fetching audits:", error);
      toast.error("Failed to load audits");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAudits();
  }, []);

  useEffect(() => {
    let filtered = [...audits];

    // Filter by status
    if (filters.statuses.length > 0) {
      filtered = filtered.filter((audit) =>
        filters.statuses.includes(audit.status)
      );
    }

    // Filter by interview ID
    if (filters.interviewId) {
      filtered = filtered.filter((audit) =>
        audit.file_name.toLowerCase().includes(filters.interviewId.toLowerCase())
      );
    }

    // Filter by date range
    if (filters.startDate) {
      filtered = filtered.filter(
        (audit) => new Date(audit.last_modified) >= new Date(filters.startDate)
      );
    }
    if (filters.endDate) {
      filtered = filtered.filter(
        (audit) => new Date(audit.last_modified) <= new Date(filters.endDate)
      );
    }

    setFilteredAudits(filtered);
  }, [filters, audits]);

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
                  Results ({filteredAudits.length})
                </p>
              </div>
            </div>
            <UploadDialog onUploadComplete={fetchAudits} />
          </div>
        </header>

        {/* Table Content */}
        <main className="flex-1 p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading audits...</p>
            </div>
          ) : (
            <AuditTable audits={filteredAudits} />
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
