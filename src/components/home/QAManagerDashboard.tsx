import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ClipboardCheck, 
  TrendingUp,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Search,
  Megaphone,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import RecentAchievementBadge from "@/components/RecentAchievementBadge";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import PaymentStatsCards from "@/components/home/PaymentStatsCards";

const QAManagerDashboard = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const { pendingAnnouncements } = useAnnouncements();
  const unreadNoticesCount = pendingAnnouncements.length;

  // Get overall quality stats
  const { data: stats } = useQuery({
    queryKey: ["qa-manager-stats"],
    queryFn: async () => {
      const { fetchAllRows } = await import("@/utils/paginatedFetch");
      const audits = await fetchAllRows("audits", "id, status, is_re_audit, re_audit_count");
      const reviewed = audits.filter(a => a.status === "Audit Passed" || a.status === "Audit Failed");
      
      return {
        total: audits.length,
        passed: audits.filter(a => a.status === "Audit Passed").length,
        failed: audits.filter(a => a.status === "Audit Failed").length,
        reAuditCount: audits.filter(a => a.is_re_audit).length,
        multipleReAudits: audits.filter(a => (a.re_audit_count || 0) > 1).length,
        passRate: reviewed.length > 0 
          ? Math.round((audits.filter(a => a.status === "Audit Passed").length / reviewed.length) * 100)
          : 0,
      };
    },
  });

  // Get data entry completion stats
  const { data: entryStats } = useQuery({
    queryKey: ["qa-entry-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interview_assignments")
        .select("id, entry_status, is_flagged_for_issue, issue_resolved_at");
      
      if (error) throw error;
      
      const assignments = data || [];
      return {
        total: assignments.length,
        complete: assignments.filter(a => a.entry_status === "data_entry_complete").length,
        flagged: assignments.filter(a => a.is_flagged_for_issue && !a.issue_resolved_at).length,
      };
    },
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter an interview ID");
      return;
    }
    navigate(`/data-entry?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <ClipboardCheck className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Quality Assurance Dashboard</h3>
                <p className="text-muted-foreground">
                  Monitor audit quality and data entry progress
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/analytics")} className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Full Analytics
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search interview by ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} className="gap-2">
              <Search className="h-4 w-4" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Achievement */}
      <RecentAchievementBadge />

      {/* Quality Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{stats?.passRate || 0}%</p>
            <p className="text-xs text-muted-foreground">Pass Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{stats?.passed || 0}</p>
            <p className="text-xs text-muted-foreground">Passed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <XCircle className="h-6 w-6 text-red-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{stats?.failed || 0}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-6 w-6 text-orange-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{stats?.reAuditCount || 0}</p>
            <p className="text-xs text-muted-foreground">Re-Audits</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Stats */}
      <PaymentStatsCards />

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Entry Progress */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Data Entry Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm">Total Assigned</span>
              <Badge variant="secondary">{entryStats?.total || 0}</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
              <span className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Completed
              </span>
              <Badge className="bg-green-100 text-green-700">{entryStats?.complete || 0}</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20">
              <span className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                Flagged Issues
              </span>
              <Badge className="bg-orange-100 text-orange-700">{entryStats?.flagged || 0}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => navigate("/data-entry")}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Data Entry Portal
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => navigate("/tracking")}
            >
              <span className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" />
                Interview Tracking
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => navigate("/analytics")}
            >
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics Dashboard
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => navigate("/notices")}
            >
              <span className="flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                Notice Board
              </span>
              {unreadNoticesCount > 0 ? (
                <Badge variant="secondary">{unreadNoticesCount}</Badge>
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quality Alerts */}
      {stats?.multipleReAudits && stats.multipleReAudits > 0 && (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="font-medium">Multiple Re-Audits Detected</p>
                  <p className="text-sm text-muted-foreground">
                    {stats.multipleReAudits} interviews have been re-audited more than once
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate("/tracking")}
              >
                Review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default QAManagerDashboard;
