import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  Search, 
  CheckCircle2, 
  Clock, 
  FileText,
  User,
  Calendar,
  Users,
  Loader2,
  AlertCircle,
  BarChart3,
  Undo2,
  Flag,
  AlertTriangle,
  CheckCircle
} from "lucide-react";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { toast } from "sonner";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AuditPagination } from "@/components/AuditPagination";
import { useUndoCompletion, useFlagForIssue } from "@/hooks/useTeamAssignments";

const DataEntryPortal = () => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchedId, setSearchedId] = useState("");
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Flag for issue dialog
  const [showFlagDialog, setShowFlagDialog] = useState(false);
  const [flagComment, setFlagComment] = useState("");
  const [flaggingAssignmentId, setFlaggingAssignmentId] = useState<string | null>(null);

  const undoCompletion = useUndoCompletion();
  const flagForIssue = useFlagForIssue();

  // Get date filter start date
  const getDateFilterStart = (filter: "today" | "week" | "month" | "all") => {
    const now = new Date();
    switch (filter) {
      case "today":
        return startOfDay(now).toISOString();
      case "week":
        return startOfWeek(now, { weekStartsOn: 1 }).toISOString();
      case "month":
        return startOfMonth(now).toISOString();
      default:
        return null;
    }
  };

  // Stats query
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["data-entry-stats", user?.id, dateFilter],
    queryFn: async () => {
      if (!user?.id) return { totalInterviews: 0, totalNames: 0 };
      
      const startDate = getDateFilterStart(dateFilter);
      
      let query = supabase
        .from("interview_assignments")
        .select(`
          id,
          audit_id,
          entry_completed_at
        `)
        .eq("entry_completed_by", user.id)
        .eq("entry_status", "data_entry_complete");
      
      if (startDate) {
        query = query.gte("entry_completed_at", startDate);
      }
      
      const { data: assignments, error } = await query;
      
      if (error) throw error;
      if (!assignments || assignments.length === 0) {
        return { totalInterviews: 0, totalNames: 0 };
      }
      
      // Get total names from metadata
      const auditIds = assignments.map(a => a.audit_id);
      const { data: metadataList } = await supabase
        .from("interview_metadata")
        .select("total_names")
        .in("audit_id", auditIds);
      
      const totalNames = metadataList?.reduce((sum, m) => sum + (m.total_names || 0), 0) || 0;
      
      return {
        totalInterviews: assignments.length,
        totalNames
      };
    },
    enabled: !!user?.id,
  });

  // Search for interview by ID
  const { data: searchResult, isLoading: isSearching } = useQuery({
    queryKey: ["data-entry-search", searchedId],
    queryFn: async () => {
      if (!searchedId) return null;
      
      const { data: audit, error } = await supabase
        .from("audits")
        .select(`
          id,
          file_name,
          status,
          reviewed_at,
          reviewed_by
        `)
        .ilike("file_name", `%${searchedId}%`)
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      if (!audit) return null;
      
      // Get assignment info
      const { data: assignment } = await supabase
        .from("interview_assignments")
        .select(`
          id,
          entry_status,
          entry_completed_at,
          entry_completed_by,
          typing_status,
          typing_completed_at,
          team_id,
          is_flagged_for_issue,
          issue_comment,
          flagged_at,
          issue_resolved_at,
          data_entry_teams(name)
        `)
        .eq("audit_id", audit.id)
        .single();
      
      // Get metadata
      const { data: metadata } = await supabase
        .from("interview_metadata")
        .select("total_names, interviewee_name, interviewer_name, contractor_id")
        .eq("audit_id", audit.id)
        .single();
      
      return {
        audit,
        assignment,
        metadata
      };
    },
    enabled: !!searchedId,
  });

  // Mark as completed mutation
  const markCompletedMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from("interview_assignments")
        .update({
          entry_status: "data_entry_complete",
          entry_completed_by: user?.id,
          entry_completed_at: new Date().toISOString(),
        })
        .eq("id", assignmentId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Interview marked as completed!");
      queryClient.invalidateQueries({ queryKey: ["data-entry-search"] });
      queryClient.invalidateQueries({ queryKey: ["completions"] });
      queryClient.invalidateQueries({ queryKey: ["data-entry-stats"] });
      // Also invalidate team assignments and tracking to reflect the status change
      queryClient.invalidateQueries({ queryKey: ["interview-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update status");
    },
  });

  // Get all completions with pagination
  const { data: completionsData, isLoading: isLoadingCompletions } = useQuery({
    queryKey: ["completions", user?.id, currentPage, itemsPerPage],
    queryFn: async () => {
      if (!user?.id) return { data: [], totalCount: 0 };
      
      // Get total count
      const { count } = await supabase
        .from("interview_assignments")
        .select("id", { count: "exact", head: true })
        .eq("entry_completed_by", user.id)
        .eq("entry_status", "data_entry_complete");
      
      // Get paginated results
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      
      const { data, error } = await supabase
        .from("interview_assignments")
        .select(`
          id,
          entry_completed_at,
          audit_id,
          is_flagged_for_issue,
          issue_comment,
          issue_resolved_at,
          audits(file_name),
          data_entry_teams(name)
        `)
        .eq("entry_completed_by", user.id)
        .eq("entry_status", "data_entry_complete")
        .order("entry_completed_at", { ascending: false })
        .range(from, to);
      
      if (error) throw error;
      
      // Get total_names for each completion
      if (data && data.length > 0) {
        const auditIds = data.map(d => d.audit_id);
        const { data: metadataList } = await supabase
          .from("interview_metadata")
          .select("audit_id, total_names")
          .in("audit_id", auditIds);
        
        const metadataMap = new Map(metadataList?.map(m => [m.audit_id, m.total_names]) || []);
        
        return {
          data: data.map(d => ({
            ...d,
            total_names: metadataMap.get(d.audit_id) || 0
          })),
          totalCount: count || 0
        };
      }
      
      return { data: data || [], totalCount: count || 0 };
    },
    enabled: !!user?.id,
  });

  // Resolved issues query (for notifications)
  const { data: resolvedIssues = [] } = useQuery({
    queryKey: ["resolved-issues", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("interview_assignments")
        .select(`
          id,
          audit_id,
          issue_resolved_at,
          resolve_comment,
          audits(file_name)
        `)
        .eq("flagged_by", user.id)
        .not("issue_resolved_at", "is", null)
        .order("issue_resolved_at", { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Pending flagged issues (unresolved) that the current user created
  const { data: pendingFlaggedIssues = [] } = useQuery({
    queryKey: ["pending-flagged-issues", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("interview_assignments")
        .select(`
          id,
          audit_id,
          issue_comment,
          flagged_at,
          audits(file_name)
        `)
        .eq("flagged_by", user.id)
        .eq("is_flagged_for_issue", true)
        .is("issue_resolved_at", null)
        .order("flagged_at", { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter an interview ID");
      return;
    }
    setSearchedId(searchQuery.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  const handleFlagForIssue = (assignmentId: string) => {
    setFlaggingAssignmentId(assignmentId);
    setFlagComment("");
    setShowFlagDialog(true);
  };

  const submitFlag = async () => {
    if (!flaggingAssignmentId || !flagComment.trim()) {
      toast.error("Please provide a comment describing the issue");
      return;
    }
    
    await flagForIssue.mutateAsync({ 
      assignmentId: flaggingAssignmentId, 
      comment: flagComment 
    });
    
    setShowFlagDialog(false);
    setFlagComment("");
    setFlaggingAssignmentId(null);
  };

  const getStatusBadge = (status: string | null | undefined, isFlagged?: boolean, isResolved?: boolean) => {
    if (isFlagged && !isResolved) {
      return <Badge variant="destructive" className="gap-1"><Flag className="h-3 w-3" />Flagged</Badge>;
    }
    if (isFlagged && isResolved) {
      return <Badge className="bg-blue-100 text-blue-700 gap-1"><CheckCircle className="h-3 w-3" />Resolved</Badge>;
    }
    switch (status) {
      case "data_entry_complete":
        return <Badge className="bg-green-100 text-green-700">Data Entry Complete</Badge>;
      case "typing_completed":
        return <Badge className="bg-blue-100 text-blue-700">Typing Completed</Badge>;
      case "typing_in_progress":
        return <Badge className="bg-yellow-100 text-yellow-700">Typing In Progress</Badge>;
      default:
        return <Badge variant="secondary">Not Assigned</Badge>;
    }
  };

  const totalPages = Math.ceil((completionsData?.totalCount || 0) / itemsPerPage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Data Entry Portal</h1>
          <p className="text-muted-foreground mt-1">
            Search for interviews and mark them as completed
          </p>
        </div>

        {/* Resolved Issues Notification */}
        {resolvedIssues.length > 0 && (
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-blue-600" />
                Recently Resolved Issues
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <ul className="text-sm space-y-2">
                {resolvedIssues.map((issue: any) => (
                  <li key={issue.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{issue.audits?.file_name}</span>
                      <span className="text-muted-foreground">
                        resolved {issue.issue_resolved_at && format(new Date(issue.issue_resolved_at), "MMM d")}
                      </span>
                    </div>
                    {issue.resolve_comment && (
                      <p className="text-sm text-muted-foreground italic pl-2 border-l-2 border-blue-300">
                        "{issue.resolve_comment}"
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Pending Flagged Issues (Unresolved) */}
        {pendingFlaggedIssues.length > 0 && (
          <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                Your Pending Flagged Issues ({pendingFlaggedIssues.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <ul className="text-sm space-y-2">
                {pendingFlaggedIssues.map((issue: any) => (
                  <li key={issue.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="gap-1 text-xs">
                        <Flag className="h-3 w-3" />
                        Pending
                      </Badge>
                      <span className="font-mono">{issue.audits?.file_name}</span>
                      <span className="text-muted-foreground">
                        flagged {issue.flagged_at && format(new Date(issue.flagged_at), "MMM d")}
                      </span>
                    </div>
                    {issue.issue_comment && (
                      <p className="text-sm text-muted-foreground italic pl-2 border-l-2 border-yellow-400">
                        "{issue.issue_comment}"
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                My Performance
              </CardTitle>
              <Select value={dateFilter} onValueChange={(value: "today" | "week" | "month" | "all") => setDateFilter(value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-primary/20">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Interviews Completed</p>
                    <p className="text-2xl font-bold">
                      {isLoadingStats ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        stats?.totalInterviews || 0
                      )}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-green-500/20">
                    <Users className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Names Entered</p>
                    <p className="text-2xl font-bold">
                      {isLoadingStats ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        stats?.totalNames?.toLocaleString() || 0
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Find Interview
            </CardTitle>
            <CardDescription>
              Enter the interview ID to view details and update status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder="Enter Interview ID (e.g., NG71_704_20251013)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyPress}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={isSearching} className="gap-2">
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                SEARCH
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search Results */}
        {searchedId && (
          <Card>
            <CardHeader>
              <CardTitle>Search Result</CardTitle>
            </CardHeader>
            <CardContent>
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : searchResult ? (
                <div className="space-y-6">
                  {/* Flagged Issue Alert */}
                  {searchResult.assignment?.is_flagged_for_issue && !searchResult.assignment?.issue_resolved_at && (
                    <div className="p-4 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-orange-800 dark:text-orange-200">Issue Flagged</p>
                          <p className="text-sm text-orange-700 dark:text-orange-300">
                            {searchResult.assignment.issue_comment}
                          </p>
                          <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                            Flagged {searchResult.assignment.flagged_at && format(new Date(searchResult.assignment.flagged_at), "PPp")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Interview Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Interview ID</p>
                        <p className="font-medium">{searchResult.audit.file_name}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                      <User className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Interviewee</p>
                        <p className="font-medium">{searchResult.metadata?.interviewee_name || "N/A"}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Total Names</p>
                        <p className="font-medium">{searchResult.metadata?.total_names || "N/A"}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Reviewed At</p>
                        <p className="font-medium">
                          {searchResult.audit.reviewed_at 
                            ? format(new Date(searchResult.audit.reviewed_at), "PPp")
                            : "Not reviewed"
                          }
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Assigned Team</p>
                        <p className="font-medium">
                          {searchResult.assignment?.data_entry_teams?.name || "Not assigned"}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Entry Status</p>
                        {getStatusBadge(
                          searchResult.assignment?.entry_status,
                          searchResult.assignment?.is_flagged_for_issue,
                          !!searchResult.assignment?.issue_resolved_at
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  {searchResult.assignment ? (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg border gap-4">
                      <div>
                        <p className="font-medium">Update Entry Status</p>
                        <p className="text-sm text-muted-foreground">
                          Mark this interview as data entry complete or flag for issue
                        </p>
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        {searchResult.assignment.entry_status === "data_entry_complete" ? (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="font-medium">Already Completed</span>
                          </div>
                        ) : (
                          <>
                            <Button
                              onClick={() => markCompletedMutation.mutate(searchResult.assignment!.id)}
                              disabled={markCompletedMutation.isPending}
                              className="gap-2 flex-1 sm:flex-none"
                            >
                              {markCompletedMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4" />
                              )}
                              Mark as Completed
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleFlagForIssue(searchResult.assignment!.id)}
                              disabled={searchResult.assignment.is_flagged_for_issue}
                              className="gap-2 flex-1 sm:flex-none"
                            >
                              <Flag className="h-4 w-4" />
                              {searchResult.assignment.is_flagged_for_issue ? "Already Flagged" : "Flag Issue"}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 rounded-lg border border-yellow-200 bg-yellow-50">
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                      <div>
                        <p className="font-medium text-yellow-800">Not Assigned</p>
                        <p className="text-sm text-yellow-700">
                          This interview hasn't been assigned to a team yet
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No interview found</p>
                  <p className="text-sm text-muted-foreground">
                    Try searching with a different ID
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* All Completions with Pagination */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              My Completions
            </CardTitle>
            <CardDescription>
              All interviews you've marked as complete
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingCompletions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (completionsData?.data?.length || 0) === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No completions yet
              </p>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">SN</TableHead>
                      <TableHead>Interview ID</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Total Names</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Completed At</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completionsData?.data.map((completion: any, index: number) => (
                      <TableRow key={completion.id} className={completion.is_flagged_for_issue && !completion.issue_resolved_at ? "bg-orange-50 dark:bg-orange-950/20" : ""}>
                        <TableCell className="font-medium">
                          {(currentPage - 1) * itemsPerPage + index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {completion.audits?.file_name || "Unknown"}
                            {completion.is_flagged_for_issue && (
                              <Badge variant={completion.issue_resolved_at ? "secondary" : "destructive"} className="text-[10px]">
                                {completion.issue_resolved_at ? "Resolved" : "Issue"}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {completion.data_entry_teams?.name || "N/A"}
                        </TableCell>
                        <TableCell>
                          {completion.total_names || 0}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(
                            "data_entry_complete",
                            completion.is_flagged_for_issue,
                            !!completion.issue_resolved_at
                          )}
                        </TableCell>
                        <TableCell>
                          {completion.entry_completed_at 
                            ? format(new Date(completion.entry_completed_at), "PPp")
                            : "N/A"
                          }
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => undoCompletion.mutate(completion.id)}
                            disabled={undoCompletion.isPending}
                            className="gap-1 text-muted-foreground hover:text-destructive"
                          >
                            <Undo2 className="h-4 w-4" />
                            Undo
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {totalPages > 0 && (
                  <AuditPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalCount={completionsData?.totalCount || 0}
                    itemsPerPage={itemsPerPage}
                    onPageChange={handlePageChange}
                    onItemsPerPageChange={handleItemsPerPageChange}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Flag for Issue Dialog */}
      <Dialog open={showFlagDialog} onOpenChange={setShowFlagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-orange-500" />
              Flag Interview for Issue
            </DialogTitle>
            <DialogDescription>
              Describe the issue with this interview. Managers will be notified.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Describe the issue (e.g., missing data, illegible handwriting, audio quality issues...)"
            value={flagComment}
            onChange={(e) => setFlagComment(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFlagDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={submitFlag} 
              disabled={!flagComment.trim() || flagForIssue.isPending}
              className="gap-2"
            >
              {flagForIssue.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Flag className="h-4 w-4" />
              )}
              Flag Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DataEntryPortal;
