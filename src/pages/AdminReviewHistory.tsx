import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { History, Search, ChevronLeft, ChevronRight, Clock, User, ExternalLink, CheckCircle2, XCircle, Calendar, Users } from "lucide-react";

interface ReviewedAudit {
  id: string;
  file_name: string;
  status: string;
  reviewed_at: string;
  reviewed_by: string | null;
  review_comment: string | null;
  action_plan: string | null;
  is_re_audit: boolean;
  re_audit_count: number;
  review_duration_seconds: number | null;
}

const ITEMS_PER_PAGE = 20;

const AdminReviewHistory = () => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reviewerFilter, setReviewerFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch unique reviewers for filter dropdown
  const { data: reviewers } = useQuery({
    queryKey: ["all-reviewers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audits")
        .select("reviewed_by")
        .not("reviewed_by", "is", null)
        .order("reviewed_by");

      if (error) throw error;

      const uniqueReviewers = [...new Set(data.map((a) => a.reviewed_by))].filter(Boolean);
      return uniqueReviewers as string[];
    },
  });

  // Fetch summary stats with total names
  const { data: stats } = useQuery({
    queryKey: ["admin-review-stats"],
    queryFn: async () => {
      // Get all reviewed audits with metadata
      const { data: allReviewed } = await supabase
        .from("audits")
        .select("status, reviewed_at, interview_metadata(total_names)")
        .not("reviewed_at", "is", null);

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      let totalReviews = 0;
      let totalNames = 0;
      let passedReviews = 0;
      let passedNames = 0;
      let failedReviews = 0;
      let failedNames = 0;
      let monthlyReviews = 0;
      let monthlyNames = 0;

      allReviewed?.forEach((audit) => {
        const meta = audit.interview_metadata as { total_names: number | null }[] | null;
        const names = meta?.[0]?.total_names || 0;

        totalReviews++;
        totalNames += names;

        if (audit.status === "Audit Passed") {
          passedReviews++;
          passedNames += names;
        } else if (audit.status === "Audit Failed") {
          failedReviews++;
          failedNames += names;
        }

        if (audit.reviewed_at && new Date(audit.reviewed_at) >= startOfMonth) {
          monthlyReviews++;
          monthlyNames += names;
        }
      });

      return {
        total: totalReviews,
        passed: passedReviews,
        failed: failedReviews,
        monthly: monthlyReviews,
        totalNames,
        passedNames,
        failedNames,
        monthlyNames,
      };
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-review-history", currentPage, statusFilter, reviewerFilter, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("audits")
        .select("id, file_name, status, reviewed_at, reviewed_by, review_comment, action_plan, is_re_audit, re_audit_count, review_duration_seconds", { count: "exact" })
        .not("reviewed_at", "is", null)
        .order("reviewed_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as "Audit Passed" | "Audit Failed");
      }

      if (reviewerFilter !== "all") {
        query = query.eq("reviewed_by", reviewerFilter);
      }

      if (searchTerm) {
        query = query.ilike("file_name", `%${searchTerm}%`);
      }

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data: audits, count, error } = await query.range(from, to);

      if (error) throw error;

      return {
        audits: (audits || []) as ReviewedAudit[],
        totalCount: count || 0,
      };
    },
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

  const totalPages = Math.ceil((data?.totalCount || 0) / ITEMS_PER_PAGE);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <History className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">All Review History</h1>
          <p className="text-sm text-muted-foreground">
            Complete audit review history across all reviewers
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Reviews</p>
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{(stats?.totalNames || 0).toLocaleString()} names</span>
                </div>
              </div>
              <History className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Passed</p>
                <p className="text-2xl font-bold text-green-600">{stats?.passed || 0}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{(stats?.passedNames || 0).toLocaleString()} names</span>
                </div>
              </div>
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">{stats?.failed || 0}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{(stats?.failedNames || 0).toLocaleString()} names</span>
                </div>
              </div>
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">{stats?.monthly || 0}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{(stats?.monthlyNames || 0).toLocaleString()} names</span>
                </div>
              </div>
              <Calendar className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
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
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Audit Passed">Passed</SelectItem>
            <SelectItem value="Audit Failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={reviewerFilter}
          onValueChange={(value) => {
            setReviewerFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Reviewer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reviewers</SelectItem>
            {reviewers?.map((reviewer) => (
              <SelectItem key={reviewer} value={reviewer}>
                {reviewer}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
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
                    <TableHead>Interview ID</TableHead>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Review Date</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Re-audit</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.audits.map((audit) => (
                    <TableRow
                      key={audit.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/review/${audit.id}`)}
                    >
                      <TableCell className="font-medium font-mono text-sm">
                        {audit.file_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {audit.reviewed_by || "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={audit.status === "Audit Passed" ? "default" : "destructive"}
                        >
                          {audit.status === "Audit Passed" ? "Passed" : "Failed"}
                        </Badge>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages} ({data?.totalCount} total)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReviewHistory;
