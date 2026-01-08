import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Download,
  FileText,
  Calendar,
  Users,
  Loader2,
  ArrowUpDown,
  Filter,
  X
} from "lucide-react";
import { format } from "date-fns";
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
import { Label } from "@/components/ui/label";

interface TrackingInterview {
  id: string;
  file_name: string;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  contractor_id: string | null;
  interviewer_code: string | null;
  field_manager: string | null;
  total_names: number | null;
  interviewee_name: string | null;
  interview_date: string | null;
}

const InterviewTracking = () => {
  const { user, userRole, profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("reviewed_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Filters
  const [filters, setFilters] = useState({
    contractor: "",
    fieldManager: "",
    agentCode: "",
    status: "",
    startDate: "",
    endDate: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  const isAdmin = userRole === 'admin';
  const isSuperAdmin = userRole === 'super_admin';
  const isFieldManager = userRole === 'field_manager';
  const isContractor = userRole === 'contractor';

  // Get field managers assigned to this admin
  const { data: assignedFieldManagers = [] } = useQuery({
    queryKey: ["admin-field-managers", user?.id],
    queryFn: async () => {
      if (!user?.id || !isAdmin) return [];
      
      const { data, error } = await supabase
        .from("field_manager_admin_assignments")
        .select("field_manager_id, profiles!field_manager_admin_assignments_field_manager_id_fkey(full_name)")
        .eq("admin_id", user.id)
        .eq("is_active", true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin && !!user?.id,
  });

  // Get team codes for field managers
  const { data: teamAssignments = [] } = useQuery({
    queryKey: ["team-assignments-tracking", user?.id, assignedFieldManagers],
    queryFn: async () => {
      if (!user?.id) return [];
      
      let query = supabase
        .from("team_assignments")
        .select("interviewer_code, field_manager_id, profiles!team_assignments_field_manager_id_fkey(full_name)")
        .eq("status", "approved");
      
      if (isFieldManager) {
        query = query.eq("field_manager_id", user.id);
      } else if (isAdmin && assignedFieldManagers.length > 0) {
        const fmIds = assignedFieldManagers.map((fm: any) => fm.field_manager_id);
        query = query.in("field_manager_id", fmIds);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && (isFieldManager || (isAdmin && assignedFieldManagers.length > 0) || isSuperAdmin),
  });

  // Main interviews query
  const { data: interviews = [], isLoading } = useQuery({
    queryKey: ["tracking-interviews", userRole, profile?.contractor_id, teamAssignments, filters],
    queryFn: async () => {
      // Get audits with passed status
      let query = supabase
        .from("audits")
        .select(`
          id,
          file_name,
          status,
          reviewed_at,
          reviewed_by
        `)
        .eq("status", "Audit Passed");
      
      const { data: audits, error: auditsError } = await query;
      if (auditsError) throw auditsError;
      
      if (!audits || audits.length === 0) return [];
      
      // Get metadata for these audits
      const auditIds = audits.map(a => a.id);
      const { data: metadata, error: metaError } = await supabase
        .from("interview_metadata")
        .select("audit_id, contractor_id, interviewer_code, field_manager, total_names, interviewee_name, interview_date")
        .in("audit_id", auditIds);
      
      if (metaError) throw metaError;
      
      // Combine data
      const metadataMap = new Map(metadata?.map(m => [m.audit_id, m]) || []);
      let results: TrackingInterview[] = audits.map(audit => {
        const meta = metadataMap.get(audit.id);
        return {
          id: audit.id,
          file_name: audit.file_name,
          status: audit.status,
          reviewed_at: audit.reviewed_at,
          reviewed_by: audit.reviewed_by,
          contractor_id: meta?.contractor_id || null,
          interviewer_code: meta?.interviewer_code || null,
          field_manager: meta?.field_manager || null,
          total_names: meta?.total_names || null,
          interviewee_name: meta?.interviewee_name || null,
          interview_date: meta?.interview_date || null,
        };
      });
      
      // Apply role-based filtering
      if (isContractor && profile?.contractor_id) {
        results = results.filter(r => r.contractor_id === profile.contractor_id);
      } else if (isFieldManager && teamAssignments.length > 0) {
        const myCodes = teamAssignments.map((t: any) => t.interviewer_code);
        results = results.filter(r => r.interviewer_code && myCodes.includes(r.interviewer_code));
      } else if (isAdmin && teamAssignments.length > 0) {
        const assignedCodes = teamAssignments.map((t: any) => t.interviewer_code);
        results = results.filter(r => r.interviewer_code && assignedCodes.includes(r.interviewer_code));
      }
      // Super admin sees all
      
      return results;
    },
    enabled: !!user?.id,
  });

  // Get unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    const contractors = [...new Set(interviews.map(i => i.contractor_id).filter(Boolean))];
    const fieldManagers = [...new Set(interviews.map(i => i.field_manager).filter(Boolean))];
    const agentCodes = [...new Set(interviews.map(i => i.interviewer_code).filter(Boolean))];
    return { contractors, fieldManagers, agentCodes };
  }, [interviews]);

  // Apply filters and search
  const filteredInterviews = useMemo(() => {
    return interviews.filter(interview => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          interview.file_name.toLowerCase().includes(query) ||
          interview.interviewee_name?.toLowerCase().includes(query) ||
          interview.interviewer_code?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      
      // Apply other filters
      if (filters.contractor && interview.contractor_id !== filters.contractor) return false;
      if (filters.fieldManager && interview.field_manager !== filters.fieldManager) return false;
      if (filters.agentCode && interview.interviewer_code !== filters.agentCode) return false;
      if (filters.startDate && interview.interview_date && interview.interview_date < filters.startDate) return false;
      if (filters.endDate && interview.interview_date && interview.interview_date > filters.endDate) return false;
      
      return true;
    });
  }, [interviews, searchQuery, filters]);

  // Sort interviews
  const sortedInterviews = useMemo(() => {
    return [...filteredInterviews].sort((a, b) => {
      let aVal = a[sortField as keyof TrackingInterview];
      let bVal = b[sortField as keyof TrackingInterview];
      
      if (aVal === null) aVal = "";
      if (bVal === null) bVal = "";
      
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      }
      
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortOrder === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [filteredInterviews, sortField, sortOrder]);

  // Paginate
  const paginatedInterviews = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedInterviews.slice(start, start + itemsPerPage);
  }, [sortedInterviews, currentPage]);

  const totalPages = Math.ceil(sortedInterviews.length / itemsPerPage);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleExportCSV = () => {
    const headers = ["Interview ID", "Contractor", "Agent Code", "Field Manager", "Total Names", "Interviewee", "Interview Date", "Reviewed By", "Reviewed At"];
    const rows = sortedInterviews.map(i => [
      i.file_name,
      i.contractor_id || "",
      i.interviewer_code || "",
      i.field_manager || "",
      i.total_names?.toString() || "",
      i.interviewee_name || "",
      i.interview_date || "",
      i.reviewed_by || "",
      i.reviewed_at ? format(new Date(i.reviewed_at), "yyyy-MM-dd HH:mm") : ""
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-tracking-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setFilters({
      contractor: "",
      fieldManager: "",
      agentCode: "",
      status: "",
      startDate: "",
      endDate: "",
    });
    setSearchQuery("");
  };

  const hasActiveFilters = Object.values(filters).some(v => v) || searchQuery;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Interview Tracking</h1>
            <p className="text-muted-foreground mt-1">
              {isSuperAdmin ? "View all interviews across the organization" :
               isAdmin ? "View interviews from your assigned field managers" :
               isFieldManager ? "View interviews from your team" :
               "View interviews from your contractor"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && <Badge variant="secondary" className="ml-1">Active</Badge>}
            </Button>
            <Button onClick={handleExportCSV} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Interviews</p>
                <p className="text-2xl font-bold">{interviews.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unique Agents</p>
                <p className="text-2xl font-bold">{filterOptions.agentCodes.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Names</p>
                <p className="text-2xl font-bold">
                  {interviews.reduce((sum, i) => sum + (i.total_names || 0), 0).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Filtered Results</p>
                <p className="text-2xl font-bold">{filteredInterviews.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Filters</CardTitle>
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                  <X className="h-4 w-4" />
                  Clear All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <Label className="text-sm">Search</Label>
                  <Input
                    placeholder="ID, name, code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm">Contractor</Label>
                  <Select value={filters.contractor} onValueChange={(v) => setFilters({ ...filters, contractor: v === "all" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Contractors</SelectItem>
                      {filterOptions.contractors.map(c => (
                        <SelectItem key={c} value={c!}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Field Manager</Label>
                  <Select value={filters.fieldManager} onValueChange={(v) => setFilters({ ...filters, fieldManager: v === "all" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Field Managers</SelectItem>
                      {filterOptions.fieldManagers.map(fm => (
                        <SelectItem key={fm} value={fm!}>{fm}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Agent Code</Label>
                  <Select value={filters.agentCode} onValueChange={(v) => setFilters({ ...filters, agentCode: v === "all" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Agents</SelectItem>
                      {filterOptions.agentCodes.map(code => (
                        <SelectItem key={code} value={code!}>{code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Start Date</Label>
                  <Input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-sm">End Date</Label>
                  <Input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : paginatedInterviews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No interviews found</p>
                <p className="text-sm text-muted-foreground">
                  {hasActiveFilters ? "Try adjusting your filters" : "No interviews match your access level"}
                </p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer" onClick={() => handleSort("file_name")}>
                        <div className="flex items-center gap-1">
                          Interview ID
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead>Contractor</TableHead>
                      <TableHead>Agent Code</TableHead>
                      <TableHead>Field Manager</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort("total_names")}>
                        <div className="flex items-center gap-1">
                          Names
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead>Interviewee</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort("interview_date")}>
                        <div className="flex items-center gap-1">
                          Date
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                      <TableHead>Reviewed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInterviews.map((interview) => (
                      <TableRow key={interview.id}>
                        <TableCell className="font-medium">{interview.file_name}</TableCell>
                        <TableCell>{interview.contractor_id || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{interview.interviewer_code || "-"}</Badge>
                        </TableCell>
                        <TableCell>{interview.field_manager || "-"}</TableCell>
                        <TableCell>{interview.total_names || "-"}</TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {interview.interviewee_name || "-"}
                        </TableCell>
                        <TableCell>
                          {interview.interview_date || "-"}
                        </TableCell>
                        <TableCell>{interview.reviewed_by || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, sortedInterviews.length)} of {sortedInterviews.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InterviewTracking;