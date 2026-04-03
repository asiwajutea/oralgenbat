import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditPagination } from "@/components/AuditPagination";
import { OfflineTablePlaceholder } from "@/components/OfflineTablePlaceholder";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { format } from "date-fns";
import { History, Search, Clock, MessageSquare, ExternalLink, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ReviewedAudit {
  id: string;
  file_name: string;
  status: string;
  reviewed_at: string;
  review_comment: string | null;
  action_plan: string | null;
  is_re_audit: boolean;
  re_audit_count: number;
  review_duration_seconds: number | null;
  passed_with_failures: boolean;
  pass_override_reason: string | null;
  pass_override_action_plan: string | null;
}

const ReviewHistory = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["review-history", profile?.full_name, currentPage, statusFilter, searchTerm, itemsPerPage],
    queryFn: async () => {
      if (!profile?.full_name) return { audits: [], totalCount: 0 };

      let query = supabase
        .from("audits")
        .select("id, file_name, status, reviewed_at, review_comment, action_plan, is_re_audit, re_audit_count, review_duration_seconds, passed_with_failures, pass_override_reason, pass_override_action_plan", { count: "exact" })
        .eq("reviewed_by", profile.full_name)
        .not("reviewed_at", "is", null)
        .order("reviewed_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "Audit Passed" | "Audit Failed");
      }

      if (searchTerm) {
        query = query.ilike("file_name", `%${searchTerm}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      const { data: audits, count, error } = await query.range(from, to);

      if (error) throw error;

      return {
        audits: (audits || []) as ReviewedAudit[],
        totalCount: count || 0,
      };
    },
    enabled: !!profile?.full_name,
  });

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const totalPages = Math.ceil((data?.totalCount || 0) / itemsPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">My Review History</h1>
            <p className="text-sm text-muted-foreground">
              {data?.totalCount || 0} reviews completed
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by interview ID..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Audit Failed">Failed</SelectItem>
            <SelectItem value="Audit Passed">Passed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {!isOnline ? (
        <OfflineTablePlaceholder />
      ) : (
        <Card>
          <CardContent className="p-0">
            {data?.audits.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No reviews found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">SN</TableHead>
                      <TableHead>Interview ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Review Date</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Re-audit</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.audits.map((audit, index) => (
                      <TableRow
                        key={audit.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/review/${audit.id}`)}
                      >
                        <TableCell className="font-medium">
                          {(currentPage - 1) * itemsPerPage + index + 1}
                        </TableCell>
                        <TableCell className="font-medium font-mono text-sm">
                          {audit.file_name}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge
                              variant={audit.status === "Audit Passed" ? "default" : "destructive"}
                            >
                              {audit.status === "Audit Passed" ? "Passed" : "Failed"}
                            </Badge>
                            {audit.status === "Audit Passed" && audit.passed_with_failures && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-amber-100 text-amber-700 border border-amber-300 cursor-help" onClick={(e) => e.stopPropagation()}>
                                      <AlertTriangle className="h-3 w-3" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <p className="font-semibold text-xs mb-1">Passed with Override</p>
                                    <p className="text-xs">{audit.pass_override_reason || "No reason provided"}</p>
                                    {audit.pass_override_action_plan && (
                                      <p className="text-xs mt-1 text-muted-foreground">Action Plan: {audit.pass_override_action_plan}</p>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {audit.reviewed_at && format(new Date(audit.reviewed_at), "PPp")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDuration(audit.review_duration_seconds)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {audit.is_re_audit ? (
                            <Badge variant="outline" className="text-xs">
                              #{audit.re_audit_count}
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {audit.review_comment || audit.action_plan ? (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <MessageSquare className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate text-xs">
                                {audit.review_comment || audit.action_plan}
                              </span>
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      <AuditPagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={data?.totalCount || 0}
        itemsPerPage={itemsPerPage}
        onPageChange={handlePageChange}
        onItemsPerPageChange={handleItemsPerPageChange}
      />
    </div>
  );
};

export default ReviewHistory;