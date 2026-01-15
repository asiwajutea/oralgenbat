import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  X,
  Eye,
  CheckCircle,
  XCircle,
  FileCheck,
  FolderOpen,
  Upload,
  ChevronDown,
  AlertTriangle,
  Flag
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
import { FailedInterviewModal } from "@/components/tracking/FailedInterviewModal";
import { ViewIssueDialog } from "@/components/tracking/ViewIssueDialog";
import { AuditPagination } from "@/components/AuditPagination";
import { toast } from "@/hooks/use-toast";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useIsMobile } from "@/hooks/use-mobile";
import { useResolveIssue } from "@/hooks/useTeamAssignments";

interface TrackingInterview {
  id: string;
  file_name: string;
  file_url: string | null;
  status: string;
  reviewed_at: string | null;
  review_comment: string | null;
  action_plan: string | null;
  artifact_correction: string[] | null;
  field_manager: string | null;
  total_names: number | null;
  interviewee_name: string | null;
  interview_date: string | null;
  has_metadata: boolean;
  has_pdf: boolean;
  team_assigned: boolean;
  team_name: string | null;
  entry_status: string | null;
  // Flagged issue fields
  is_flagged_for_issue: boolean;
  issue_comment: string | null;
  flagged_by: string | null;
  flagged_at: string | null;
  issue_resolved_at: string | null;
  issue_resolved_by: string | null;
  resolve_comment: string | null;
  assignment_id: string | null;
}

const InterviewTracking = () => {
  const { user, userRole, profile } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<string>("reviewed_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  // Filters
  const [filters, setFilters] = useState({
    fieldManager: "",
    status: "",
    startDate: "",
    endDate: "",
    metadataStatus: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  // Failed interview modal
  const [selectedInterview, setSelectedInterview] = useState<TrackingInterview | null>(null);
  const [showFailedModal, setShowFailedModal] = useState(false);

  // View Issue dialog
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [selectedIssueInterview, setSelectedIssueInterview] = useState<TrackingInterview | null>(null);
  const resolveIssueMutation = useResolveIssue();

  // File upload refs
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const isAdmin = userRole === 'admin';
  const isSuperAdmin = userRole === 'super_admin';
  const isFieldManager = userRole === 'field_manager';
  const isContractor = userRole === 'contractor';
  
  // Use active_contractor_id if set, otherwise fall back to contractor_id
  const effectiveContractorId = profile?.active_contractor_id || profile?.contractor_id;

  // Get field managers assigned to this admin
  const { data: assignedFieldManagers = [] } = useQuery({
    queryKey: ["admin-field-managers", user?.id],
    queryFn: async () => {
      if (!user?.id || !isAdmin) return [];
      
      const { data, error } = await supabase
        .from("field_manager_admin_assignments")
        .select("field_manager_id")
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
        .select("interviewer_code, field_manager_id")
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

  // Main interviews query - now fetches all statuses
  const { data: interviews = [], isLoading } = useQuery({
    queryKey: ["tracking-interviews", userRole, effectiveContractorId, teamAssignments],
    queryFn: async () => {
      // Get audits with all statuses (not just passed)
      const { data: audits, error: auditsError } = await supabase
        .from("audits")
        .select(`
          id,
          file_name,
          file_url,
          status,
          reviewed_at,
          review_comment,
          action_plan,
          artifact_correction
        `);
      
      if (auditsError) throw auditsError;
      if (!audits || audits.length === 0) return [];
      
      // Get metadata for these audits
      const auditIds = audits.map(a => a.id);
      const { data: metadata } = await supabase
        .from("interview_metadata")
        .select("audit_id, contractor_id, interviewer_code, field_manager, total_names, interviewee_name, interview_date")
        .in("audit_id", auditIds);
      
      // Get interview assignments with entry status and flagging info
      const { data: assignments } = await supabase
        .from("interview_assignments")
        .select(`
          id,
          audit_id, 
          team_id, 
          entry_status,
          is_flagged_for_issue,
          issue_comment,
          flagged_by,
          flagged_at,
          issue_resolved_at,
          issue_resolved_by,
          resolve_comment,
          data_entry_teams(name)
        `)
        .in("audit_id", auditIds);
      
      // Create maps
      const metadataMap = new Map(metadata?.map(m => [m.audit_id, m]) || []);
      const assignmentMap = new Map(assignments?.map(a => [a.audit_id, a]) || []);
      
      let results: TrackingInterview[] = audits.map(audit => {
        const meta = metadataMap.get(audit.id);
        const assignment = assignmentMap.get(audit.id);
        
        return {
          id: audit.id,
          file_name: audit.file_name,
          file_url: audit.file_url,
          status: audit.status,
          reviewed_at: audit.reviewed_at,
          review_comment: audit.review_comment,
          action_plan: audit.action_plan,
          artifact_correction: audit.artifact_correction,
          field_manager: meta?.field_manager || null,
          total_names: meta?.total_names || null,
          interviewee_name: meta?.interviewee_name || null,
          interview_date: meta?.interview_date || null,
          has_metadata: !!meta,
          has_pdf: !!audit.file_url,
          team_assigned: !!assignment,
          team_name: (assignment?.data_entry_teams as any)?.name || null,
          entry_status: assignment?.entry_status || null,
          // Flagged issue fields
          is_flagged_for_issue: assignment?.is_flagged_for_issue || false,
          issue_comment: assignment?.issue_comment || null,
          flagged_by: assignment?.flagged_by || null,
          flagged_at: assignment?.flagged_at || null,
          issue_resolved_at: assignment?.issue_resolved_at || null,
          issue_resolved_by: assignment?.issue_resolved_by || null,
          resolve_comment: assignment?.resolve_comment || null,
          assignment_id: assignment?.id || null,
          // For filtering
          contractor_id: meta?.contractor_id || null,
          interviewer_code: meta?.interviewer_code || null,
        };
      });
      
      // Apply role-based filtering
      if (isContractor && effectiveContractorId) {
        results = results.filter(r => (r as any).contractor_id === effectiveContractorId);
      } else if (isFieldManager && teamAssignments.length > 0) {
        const myCodes = teamAssignments.map((t: any) => t.interviewer_code);
        results = results.filter(r => (r as any).interviewer_code && myCodes.includes((r as any).interviewer_code));
      } else if (isAdmin && teamAssignments.length > 0) {
        const assignedCodes = teamAssignments.map((t: any) => t.interviewer_code);
        results = results.filter(r => (r as any).interviewer_code && assignedCodes.includes((r as any).interviewer_code));
      }
      // Super admin sees all
      
      return results;
    },
    enabled: !!user?.id,
  });

  // Get unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    const fieldManagers = [...new Set(interviews.map(i => i.field_manager).filter(Boolean))];
    const statuses = [...new Set(interviews.map(i => i.status).filter(Boolean))];
    return { fieldManagers, statuses };
  }, [interviews]);

  // Apply filters and search
  const filteredInterviews = useMemo(() => {
    return interviews.filter(interview => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          interview.file_name.toLowerCase().includes(query) ||
          interview.interviewee_name?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      
      // Apply other filters
      if (filters.fieldManager && interview.field_manager !== filters.fieldManager) return false;
      if (filters.status && interview.status !== filters.status) return false;
      if (filters.startDate && interview.interview_date && interview.interview_date < filters.startDate) return false;
      if (filters.endDate && interview.interview_date && interview.interview_date > filters.endDate) return false;
      
      // Metadata status filter
      if (filters.metadataStatus === "with_metadata" && !interview.has_metadata) return false;
      if (filters.metadataStatus === "without_metadata" && interview.has_metadata) return false;
      
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
  }, [sortedInterviews, currentPage, itemsPerPage]);

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
    const headers = ["Interview ID", "Field Manager", "Total Names", "Interviewee", "Interview Date", "Status", "Team Assigned", "PDF", "Metadata"];
    const rows = sortedInterviews.map(i => [
      i.file_name,
      i.field_manager || "",
      i.total_names?.toString() || "",
      i.interviewee_name || "",
      i.interview_date || "",
      i.status,
      i.team_assigned ? (i.team_name || "Yes") : "No",
      i.has_pdf ? "Yes" : "No",
      i.has_metadata ? "Yes" : "No",
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
      fieldManager: "",
      status: "",
      startDate: "",
      endDate: "",
      metadataStatus: "",
    });
    setSearchQuery("");
  };

  const hasActiveFilters = Object.values(filters).some(v => v) || searchQuery;

  // Check if user can resolve issues (field managers, admins, super admins)
  const canResolveIssue = isFieldManager || isAdmin || isSuperAdmin;

  const handleViewIssue = (interview: TrackingInterview) => {
    setSelectedIssueInterview(interview);
    setShowIssueDialog(true);
  };

  const handleResolveIssue = async (assignmentId: string, comment?: string) => {
    await resolveIssueMutation.mutateAsync({ assignmentId, comment });
  };

  // Get team assignment badge based on flagged status
  const getTeamBadge = (interview: TrackingInterview) => {
    if (!interview.team_assigned) {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Not Assigned
        </Badge>
      );
    }

    // Flagged and not resolved - RED
    if (interview.is_flagged_for_issue && !interview.issue_resolved_at) {
      return (
        <Badge className="gap-1 bg-red-500 text-white border-red-600">
          <AlertTriangle className="h-3 w-3" />
          {interview.team_name || "Flagged"}
        </Badge>
      );
    }

    // Completed - GREEN
    if (interview.entry_status === 'data_entry_complete') {
      return (
        <Badge className="gap-1 bg-green-500 text-white border-green-600">
          <Users className="h-3 w-3" />
          {interview.team_name || "Assigned"}
        </Badge>
      );
    }

    // In progress - YELLOW
    return (
      <Badge className="gap-1 bg-yellow-400 text-yellow-900 border-yellow-500">
        <Users className="h-3 w-3" />
        {interview.team_name || "Assigned"}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Audit Passed":
        return <Badge className="bg-success text-success-foreground gap-1"><CheckCircle className="h-3 w-3" />Passed</Badge>;
      case "Audit Failed":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
      case "Awaiting Review":
        return <Badge variant="outline" className="text-warning border-warning gap-1">Pending</Badge>;
      case "In Review":
        return <Badge variant="secondary" className="gap-1">In Review</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleViewFailed = (interview: TrackingInterview) => {
    setSelectedInterview(interview);
    setShowFailedModal(true);
  };

  // Handle metadata upload from tracking page
  const handleMetadataUpload = async (interviewId: string, fileName: string, file: File) => {
    if (!file || !file.name.endsWith('.zip')) {
      toast({
        title: "Invalid file",
        description: "Please upload a ZIP file containing metadata",
        variant: "destructive",
      });
      return;
    }

    setUploadingId(interviewId);
    
    try {
      // Upload the ZIP file
      const zipPath = `mobile-zips/${interviewId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("mobile-zips")
        .upload(zipPath, file);
      
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("mobile-zips")
        .getPublicUrl(zipPath);

      // Update the audit with the mobile zip URL
      const { error: updateError } = await supabase
        .from("audits")
        .update({
          mobile_zip_url: urlData.publicUrl,
          mobile_zip_uploaded_at: new Date().toISOString(),
        })
        .eq("id", interviewId);

      if (updateError) throw updateError;

      // Invoke the process-mobile-zip edge function to extract metadata
      const { error: processError } = await supabase.functions.invoke("process-mobile-zip", {
        body: { 
          auditId: interviewId, 
          zipUrl: urlData.publicUrl 
        },
      });

      if (processError) {
        console.error("Process error:", processError);
        // Don't throw - the upload succeeded, processing might work later
      }

      toast({
        title: "Metadata uploaded",
        description: "The metadata ZIP has been uploaded and is being processed.",
      });

      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload metadata",
        variant: "destructive",
      });
    } finally {
      setUploadingId(null);
    }
  };

  const triggerFileInput = (interviewId: string) => {
    fileInputRefs.current[interviewId]?.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container py-4 sm:py-8 px-4 sm:px-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Interview Tracking</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              {isSuperAdmin ? "View all interviews" :
               isAdmin ? "View interviews from your assigned field managers" :
               isFieldManager ? "View interviews from your team" :
               "View interviews from your contractor"}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2 text-xs sm:text-sm">
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {hasActiveFilters && <Badge variant="secondary" className="ml-1">Active</Badge>}
            </Button>
            <Button onClick={handleExportCSV} className="gap-2 text-xs sm:text-sm">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Total</p>
                <p className="text-lg sm:text-2xl font-bold">{interviews.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Passed</p>
                <p className="text-2xl font-bold">{interviews.filter(i => i.status === "Audit Passed").length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold">{interviews.filter(i => i.status === "Audit Failed").length}</p>
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
                    placeholder="ID, interviewee..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-sm">Field Manager</Label>
                  <Select value={filters.fieldManager} onValueChange={(v) => setFilters({ ...filters, fieldManager: v === "all" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Field Managers</SelectItem>
                      {[...filterOptions.fieldManagers].sort((a, b) => (a ?? '').localeCompare(b ?? '')).map(fm => (
                        <SelectItem key={fm} value={fm!}>{fm}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Status</Label>
                  <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {[...filterOptions.statuses].sort((a, b) => (a ?? '').localeCompare(b ?? '')).map(s => (
                        <SelectItem key={s} value={s!}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Metadata</Label>
                  <Select value={filters.metadataStatus} onValueChange={(v) => setFilters({ ...filters, metadataStatus: v === "all" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Interviews</SelectItem>
                      <SelectItem value="with_metadata">With Metadata</SelectItem>
                      <SelectItem value="without_metadata">Without Metadata</SelectItem>
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

        {/* Table/Mobile View */}
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
            ) : isMobile ? (
              /* Mobile Accordion View */
              <div className="divide-y">
                <Accordion type="single" collapsible className="w-full">
                  {paginatedInterviews.map((interview, index) => (
                    <AccordionItem key={interview.id} value={interview.id} className="border-0 border-b">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex flex-col items-start gap-1 text-left flex-1 mr-2">
                          <div className="flex items-center gap-2 w-full">
                            <span className="font-mono text-sm font-medium truncate max-w-[200px]">
                              {interview.file_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Mobile team badge */}
                            {!interview.team_assigned ? (
                              <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                                Not Assigned
                              </Badge>
                            ) : interview.is_flagged_for_issue && !interview.issue_resolved_at ? (
                              <Badge className="h-5 text-[10px] bg-red-500 text-white gap-0.5">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {interview.team_name || "Flagged"}
                              </Badge>
                            ) : interview.entry_status === 'data_entry_complete' ? (
                              <Badge className="h-5 text-[10px] bg-green-500 text-white">
                                {interview.team_name || "Assigned"}
                              </Badge>
                            ) : (
                              <Badge className="h-5 text-[10px] bg-yellow-400 text-yellow-900">
                                {interview.team_name || "Assigned"}
                              </Badge>
                            )}
                            {getStatusBadge(interview.status)}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="space-y-3">
                          {/* Interview Details */}
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-muted-foreground text-xs">Field Manager</p>
                              <p className="font-medium">{interview.field_manager || "-"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Total Names</p>
                              <p className="font-medium">{interview.total_names || "-"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Interviewee</p>
                              <p className="font-medium truncate">{interview.interviewee_name || "-"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground text-xs">Date</p>
                              <p className="font-medium">{interview.interview_date || "-"}</p>
                            </div>
                          </div>
                          
                          {/* Artifacts Status */}
                          <div>
                            <p className="text-muted-foreground text-xs mb-1">Artifacts</p>
                            {interview.has_pdf && interview.has_metadata ? (
                              <Badge variant="outline" className="gap-1 text-success border-success">
                                <CheckCircle className="h-3 w-3" />
                                Complete
                              </Badge>
                            ) : (
                              <div className="flex items-center gap-2">
                                {!interview.has_pdf && (
                                  <Badge variant="destructive" className="gap-1">
                                    <FileCheck className="h-3 w-3" />
                                    PDF
                                  </Badge>
                                )}
                                {!interview.has_metadata && (
                                  <Badge variant="destructive" className="gap-1">
                                    <FolderOpen className="h-3 w-3" />
                                    Meta
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="flex flex-wrap items-center gap-2 pt-2">
                            {/* View PDF Button - always show if has PDF */}
                            {interview.has_pdf && interview.file_url && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(interview.file_url!, '_blank')}
                                className="gap-1"
                              >
                                <FileText className="h-3 w-3" />
                                View PDF
                              </Button>
                            )}
                            {interview.status === "Audit Failed" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewFailed(interview)}
                                className="gap-1"
                              >
                                <Eye className="h-3 w-3" />
                                View Failed
                              </Button>
                            )}
                            {/* View Issue Button - Mobile */}
                            {canResolveIssue && interview.is_flagged_for_issue && !interview.issue_resolved_at && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleViewIssue(interview)}
                                className="gap-1"
                              >
                                <Flag className="h-3 w-3" />
                                View Issue
                              </Button>
                            )}
                            {!interview.has_metadata && (
                              <>
                                <input
                                  type="file"
                                  accept=".zip"
                                  className="hidden"
                                  ref={(el) => { fileInputRefs.current[interview.id] = el; }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleMetadataUpload(interview.id, interview.file_name, file);
                                    }
                                    e.target.value = '';
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => triggerFileInput(interview.id)}
                                  disabled={uploadingId === interview.id}
                                  className="gap-1"
                                >
                                  {uploadingId === interview.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Upload className="h-3 w-3" />
                                  )}
                                  Upload Metadata
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                
                {/* Pagination */}
                <div className="px-4 py-3">
                  <AuditPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalCount={sortedInterviews.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={(newValue) => {
                      setItemsPerPage(newValue);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </div>
            ) : (
              /* Desktop Table View */
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">SN</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => handleSort("file_name")}>
                        <div className="flex items-center gap-1">
                          Interview ID
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
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
                      <TableHead>Status</TableHead>
                      <TableHead>Team Assigned</TableHead>
                      <TableHead>Artifacts</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedInterviews.map((interview, index) => (
                      <TableRow key={interview.id}>
                        <TableCell className="font-medium">
                          {(currentPage - 1) * itemsPerPage + index + 1}
                        </TableCell>
                        <TableCell 
                          className={`font-medium font-mono text-sm ${interview.status === "Audit Failed" ? "cursor-pointer hover:text-primary underline md:no-underline md:cursor-default" : ""}`}
                          onClick={() => {
                            if (interview.status === "Audit Failed") {
                              handleViewFailed(interview);
                            }
                          }}
                        >
                          {interview.file_name}
                        </TableCell>
                        <TableCell>{interview.field_manager || "-"}</TableCell>
                        <TableCell>{interview.total_names || "-"}</TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {interview.interviewee_name || "-"}
                        </TableCell>
                        <TableCell>{interview.interview_date || "-"}</TableCell>
                        <TableCell>{getStatusBadge(interview.status)}</TableCell>
                        <TableCell>
                          {getTeamBadge(interview)}
                        </TableCell>
                        <TableCell>
                          {interview.has_pdf && interview.has_metadata ? (
                            <Badge variant="outline" className="gap-1 text-success border-success">
                              <CheckCircle className="h-3 w-3" />
                              Complete
                            </Badge>
                          ) : (
                            <div className="flex items-center gap-2">
                              {!interview.has_pdf && (
                                <Badge variant="destructive" className="gap-1">
                                  <FileCheck className="h-3 w-3" />
                                  PDF
                                </Badge>
                              )}
                              {!interview.has_metadata && (
                                <Badge variant="destructive" className="gap-1">
                                  <FolderOpen className="h-3 w-3" />
                                  Meta
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {/* View PDF Button - always show for interviews with PDF but no metadata */}
                            {interview.has_pdf && interview.file_url && !interview.has_metadata && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(interview.file_url!, '_blank')}
                                className="gap-1"
                              >
                                <FileText className="h-3 w-3" />
                                View PDF
                              </Button>
                            )}
                            {interview.status === "Audit Failed" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewFailed(interview)}
                                className="gap-1"
                              >
                                <Eye className="h-3 w-3" />
                                View
                              </Button>
                            )}
                            {/* View Issue Button - Desktop */}
                            {canResolveIssue && interview.is_flagged_for_issue && !interview.issue_resolved_at && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleViewIssue(interview)}
                                className="gap-1"
                              >
                                <Flag className="h-3 w-3" />
                                View Issue
                              </Button>
                            )}
                            {!interview.has_metadata && (
                              <>
                                <input
                                  type="file"
                                  accept=".zip"
                                  className="hidden"
                                  ref={(el) => { fileInputRefs.current[interview.id] = el; }}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleMetadataUpload(interview.id, interview.file_name, file);
                                    }
                                    e.target.value = '';
                                  }}
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => triggerFileInput(interview.id)}
                                  disabled={uploadingId === interview.id}
                                  className="gap-1"
                                >
                                  {uploadingId === interview.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Upload className="h-3 w-3" />
                                  )}
                                  Upload
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                <div className="px-4 py-3 border-t">
                  <AuditPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalCount={sortedInterviews.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={(newValue) => {
                      setItemsPerPage(newValue);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Failed Interview Modal */}
      <FailedInterviewModal
        open={showFailedModal}
        onOpenChange={setShowFailedModal}
        interview={selectedInterview}
      />

      {/* View Issue Dialog */}
      <ViewIssueDialog
        open={showIssueDialog}
        onOpenChange={setShowIssueDialog}
        interview={selectedIssueInterview}
        onResolve={handleResolveIssue}
        isResolving={resolveIssueMutation.isPending}
      />
    </div>
  );
};

export default InterviewTracking;
