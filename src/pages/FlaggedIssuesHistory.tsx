import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft,
  CheckCircle2, 
  Flag,
  AlertTriangle,
  CheckCircle,
  Loader2,
  MessageCircle,
  User
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { AuditPagination } from "@/components/AuditPagination";

const FlaggedIssuesHistory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "resolved" | "completed">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch all flagged issues with resolver names
  const { data: issuesData, isLoading } = useQuery({
    queryKey: ["flagged-issues-history", user?.id, filter, currentPage],
    queryFn: async () => {
      if (!user?.id) return { data: [], totalCount: 0 };
      
      let query = supabase
        .from("interview_assignments")
        .select(`
          id,
          audit_id,
          issue_comment,
          flagged_at,
          issue_resolved_at,
          issue_resolved_by,
          resolve_comment,
          entry_status,
          audits(file_name)
        `, { count: "exact" })
        .eq("flagged_by", user.id)
        .eq("is_flagged_for_issue", true)
        .order("flagged_at", { ascending: false });

      // Apply filter
      if (filter === "pending") {
        query = query.is("issue_resolved_at", null);
      } else if (filter === "resolved") {
        query = query.not("issue_resolved_at", "is", null).neq("entry_status", "data_entry_complete");
      } else if (filter === "completed") {
        query = query.eq("entry_status", "data_entry_complete");
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      // Fetch resolver names
      const resolverIds = [...new Set((data || []).filter(d => d.issue_resolved_by).map(d => d.issue_resolved_by))];
      const resolverNames: Record<string, string> = {};
      
      for (const resolverId of resolverIds) {
        const { data: name } = await supabase.rpc("get_user_display_name", { _user_id: resolverId });
        if (name) resolverNames[resolverId] = name;
      }

      return {
        data: (data || []).map(issue => ({
          ...issue,
          resolverName: issue.issue_resolved_by ? resolverNames[issue.issue_resolved_by] || "Unknown" : null
        })),
        totalCount: count || 0
      };
    },
    enabled: !!user?.id,
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
      queryClient.invalidateQueries({ queryKey: ["flagged-issues-history"] });
      queryClient.invalidateQueries({ queryKey: ["pending-flagged-issues"] });
      queryClient.invalidateQueries({ queryKey: ["data-entry-stats"] });
      queryClient.invalidateQueries({ queryKey: ["completions"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update status");
    },
  });

  const totalPages = Math.ceil((issuesData?.totalCount || 0) / itemsPerPage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/data-entry")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageCircle className="h-6 w-6" />
              Flagged Issues History
            </h1>
            <p className="text-muted-foreground text-sm">
              View all your flagged issues and their resolutions
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-4">
          <Select value={filter} onValueChange={(value: any) => { setFilter(value); setCurrentPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Issues</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="resolved">Resolved (Awaiting)</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {issuesData?.totalCount || 0} issue{(issuesData?.totalCount || 0) !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Issues List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : issuesData?.data.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No flagged issues found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {issuesData?.data.map((issue: any) => {
              const isResolved = !!issue.issue_resolved_at;
              const isCompleted = issue.entry_status === "data_entry_complete";
              
              return (
                <Card key={issue.id} className={isCompleted ? "opacity-60" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{issue.audits?.file_name}</span>
                        {isCompleted ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Completed
                          </Badge>
                        ) : isResolved ? (
                          <Badge className="bg-green-100 text-green-700 gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Resolved
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <Flag className="h-3 w-3" />
                            Pending
                          </Badge>
                        )}
                      </div>
                      {isResolved && !isCompleted && (
                        <Button
                          size="sm"
                          onClick={() => markCompletedMutation.mutate(issue.id)}
                          disabled={markCompletedMutation.isPending}
                          className="gap-1"
                        >
                          {markCompletedMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          Mark Complete
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Chat-like conversation */}
                    <div className="space-y-3">
                      {/* User's message (right-aligned) */}
                      {issue.issue_comment && (
                        <div className="flex justify-end">
                          <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2">
                            <p className="text-sm">{issue.issue_comment}</p>
                            <p className="text-xs opacity-70 mt-1 text-right">
                              You • {issue.flagged_at && format(new Date(issue.flagged_at), "MMM d, h:mm a")}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Manager's reply (left-aligned) */}
                      {issue.resolve_comment && (
                        <div className="flex justify-start">
                          <div className="max-w-[80%] bg-muted rounded-2xl rounded-bl-md px-4 py-2">
                            <div className="flex items-center gap-1.5 mb-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs font-medium">{issue.resolverName || "Manager"}</span>
                            </div>
                            <p className="text-sm">{issue.resolve_comment}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {issue.issue_resolved_at && format(new Date(issue.issue_resolved_at), "MMM d, h:mm a")}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Awaiting response indicator */}
                      {!isResolved && (
                        <div className="flex justify-start">
                          <div className="text-xs text-muted-foreground italic flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Awaiting response...
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <AuditPagination
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={itemsPerPage}
            totalCount={issuesData?.totalCount || 0}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={() => {}}
          />
        )}
      </div>
    </div>
  );
};

export default FlaggedIssuesHistory;
