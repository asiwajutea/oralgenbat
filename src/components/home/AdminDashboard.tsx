import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Shield, 
  Users, 
  FileText,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Plus,
  BarChart3,
  ArrowRight,
  Megaphone
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminStatsCard } from "@/components/AdminStatsCard";
import RecentAchievementBadge from "@/components/RecentAchievementBadge";
import { useAnnouncements } from "@/hooks/useAnnouncements";
import PaymentStatsCards from "@/components/home/PaymentStatsCards";
const AdminDashboard = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const { pendingAnnouncements } = useAnnouncements();
  const unreadNoticesCount = pendingAnnouncements.length;

  // Get system-wide stats
  const { data: stats } = useQuery({
    queryKey: ["admin-system-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audits")
        .select("id, status, is_re_audit");
      
      if (error) throw error;
      
      const audits = data || [];
      return {
        total: audits.length,
        passed: audits.filter(a => a.status === "Audit Passed").length,
        failed: audits.filter(a => a.status === "Audit Failed").length,
        pending: audits.filter(a => a.status === "Pending").length,
        awaiting: audits.filter(a => a.status === "Awaiting Review").length,
        reAudit: audits.filter(a => a.is_re_audit && a.status === "Awaiting Review").length,
      };
    },
  });

  // Get pending user approvals
  const { data: pendingUsers = 0 } = useQuery({
    queryKey: ["admin-pending-users"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_approved", false);
      
      if (error) throw error;
      return count || 0;
    },
  });

  // Get active auditors (online now)
  const { data: activeAuditors = 0 } = useQuery({
    queryKey: ["admin-active-auditors"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_presence")
        .select("user_id", { count: "exact", head: true })
        .eq("is_online", true);
      
      if (error) throw error;
      return count || 0;
    },
  });

  // Get flagged issues count
  const { data: flaggedCount = 0 } = useQuery({
    queryKey: ["admin-flagged-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("interview_assignments")
        .select("id", { count: "exact", head: true })
        .eq("is_flagged_for_issue", true)
        .is("issue_resolved_at", null);
      
      if (error) throw error;
      return count || 0;
    },
  });

  const handleSearch = () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter an interview ID");
      return;
    }
    navigate(`/interviews?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  const passRate = stats && (stats.passed + stats.failed) > 0
    ? Math.round((stats.passed / (stats.passed + stats.failed)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Admin Dashboard</h3>
                <p className="text-muted-foreground">
                  {activeAuditors} active users online
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/admin")} className="gap-2">
                <Users className="h-4 w-4" />
                Manage Users
              </Button>
              <Button onClick={() => navigate("/interviews")} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Interview
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search Bar */}
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

      {/* Admin Stats */}
      <AdminStatsCard />

      {/* System Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-xl font-bold">{stats?.total || 0}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-2" />
            <p className="text-xl font-bold">{stats?.passed || 0}</p>
            <p className="text-xs text-muted-foreground">Passed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <XCircle className="h-5 w-5 text-red-600 mx-auto mb-2" />
            <p className="text-xl font-bold">{stats?.failed || 0}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 text-yellow-600 mx-auto mb-2" />
            <p className="text-xl font-bold">{stats?.pending || 0}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 text-orange-600 mx-auto mb-2" />
            <p className="text-xl font-bold">{stats?.reAudit || 0}</p>
            <p className="text-xs text-muted-foreground">Re-Audits</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 text-primary mx-auto mb-2" />
            <p className="text-xl font-bold">{passRate}%</p>
            <p className="text-xs text-muted-foreground">Pass Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Stats */}
      <PaymentStatsCards />

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Action Buttons */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => navigate("/interviews")}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                All Interviews
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => navigate("/tracking")}
            >
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
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
              onClick={() => navigate("/admin/team-assignments")}
            >
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Assignments
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
              {unreadNoticesCount > 0 && (
                <Badge variant="secondary">{unreadNoticesCount}</Badge>
              )}
              {unreadNoticesCount === 0 && <ArrowRight className="h-4 w-4" />}
            </Button>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Attention Required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingUsers > 0 && (
              <div 
                className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 cursor-pointer hover:bg-yellow-100 transition-colors"
                onClick={() => navigate("/admin")}
              >
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-sm">Pending User Approvals</p>
                    <p className="text-xs text-muted-foreground">Users waiting for access</p>
                  </div>
                </div>
                <Badge className="bg-yellow-100 text-yellow-700">{pendingUsers}</Badge>
              </div>
            )}
            {flaggedCount > 0 && (
              <div 
                className="flex items-center justify-between p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 cursor-pointer hover:bg-orange-100 transition-colors"
                onClick={() => navigate("/tracking?status=With Issues")}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="font-medium text-sm">Flagged Issues</p>
                    <p className="text-xs text-muted-foreground">Interviews need attention</p>
                  </div>
                </div>
                <Badge className="bg-orange-100 text-orange-700">{flaggedCount}</Badge>
              </div>
            )}
            {stats?.reAudit && stats.reAudit > 0 && (
              <div 
                className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 cursor-pointer hover:bg-red-100 transition-colors"
                onClick={() => navigate("/interviews?status=Awaiting Review")}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="font-medium text-sm">Re-Audits Pending</p>
                    <p className="text-xs text-muted-foreground">Failed interviews resubmitted</p>
                  </div>
                </div>
                <Badge className="bg-red-100 text-red-700">{stats.reAudit}</Badge>
              </div>
            )}
            {pendingUsers === 0 && flaggedCount === 0 && (!stats?.reAudit || stats.reAudit === 0) && (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
                All clear! No pending actions.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
