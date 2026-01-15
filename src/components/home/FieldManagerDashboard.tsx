import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  FileText,
  ArrowRight,
  TrendingUp,
  Clock,
  Plus
} from "lucide-react";
import { format, subDays } from "date-fns";
import RecentAchievementBadge from "@/components/RecentAchievementBadge";

const FieldManagerDashboard = () => {
  const navigate = useNavigate();
  const { profile, user } = useAuth();

  // Get team interviewer codes
  const { data: teamData } = useQuery({
    queryKey: ["fm-team-data", user?.id],
    queryFn: async () => {
      if (!user?.id) return { codes: [], count: 0 };
      
      const { data, error } = await supabase
        .from("team_assignments")
        .select("interviewer_code")
        .eq("field_manager_id", user.id)
        .eq("status", "approved");
      
      if (error) throw error;
      const codes = data?.map(t => t.interviewer_code) || [];
      return { codes, count: codes.length };
    },
    enabled: !!user?.id,
  });

  const teamCodes = teamData?.codes || [];

  // Get team stats (this week)
  const { data: teamStats } = useQuery({
    queryKey: ["fm-team-stats", teamCodes],
    queryFn: async () => {
      if (teamCodes.length === 0) return { passed: 0, failed: 0, pending: 0, reAudit: 0 };
      
      const { data, error } = await supabase
        .from("audits")
        .select("id, file_name, status, is_re_audit");
      
      if (error) throw error;
      
      const teamAudits = (data || []).filter(audit => {
        const parts = audit.file_name.split('_');
        return parts.length >= 2 && teamCodes.includes(parts[1]);
      });
      
      return {
        passed: teamAudits.filter(a => a.status === "Audit Passed").length,
        failed: teamAudits.filter(a => a.status === "Audit Failed").length,
        pending: teamAudits.filter(a => a.status === "Pending" || a.status === "Awaiting Review").length,
        reAudit: teamAudits.filter(a => a.is_re_audit).length,
      };
    },
    enabled: teamCodes.length > 0,
  });

  // Get recent team activity
  const { data: recentActivity = [] } = useQuery({
    queryKey: ["fm-recent-activity", teamCodes],
    queryFn: async () => {
      if (teamCodes.length === 0) return [];
      
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      
      const { data, error } = await supabase
        .from("audits")
        .select("id, file_name, status, reviewed_at, is_re_audit")
        .in("status", ["Audit Passed", "Audit Failed"])
        .gte("reviewed_at", sevenDaysAgo)
        .order("reviewed_at", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      
      return (data || []).filter(audit => {
        const parts = audit.file_name.split('_');
        return parts.length >= 2 && teamCodes.includes(parts[1]);
      }).slice(0, 6);
    },
    enabled: teamCodes.length > 0,
  });

  // Get flagged issues for team
  const { data: flaggedCount = 0 } = useQuery({
    queryKey: ["fm-flagged-issues", teamCodes],
    queryFn: async () => {
      if (teamCodes.length === 0) return 0;
      
      const { data, error } = await supabase
        .from("interview_assignments")
        .select("id, audits!inner(file_name)")
        .eq("is_flagged_for_issue", true)
        .is("issue_resolved_at", null);
      
      if (error) throw error;
      
      return (data || []).filter((item: any) => {
        const parts = item.audits?.file_name?.split('_') || [];
        return parts.length >= 2 && teamCodes.includes(parts[1]);
      }).length;
    },
    enabled: teamCodes.length > 0,
  });

  const passRate = teamStats && (teamStats.passed + teamStats.failed) > 0
    ? Math.round((teamStats.passed / (teamStats.passed + teamStats.failed)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Team Overview</h3>
                <p className="text-muted-foreground">
                  {teamData?.count || 0} team members active
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/team-approvals")} className="gap-2">
                Manage Team
              </Button>
              <Button onClick={() => navigate("/interviews")} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Interview
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Achievement */}
      <RecentAchievementBadge />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{teamStats?.passed || 0}</p>
            <p className="text-xs text-muted-foreground">Passed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <XCircle className="h-6 w-6 text-red-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{teamStats?.failed || 0}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 text-yellow-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{teamStats?.pending || 0}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{passRate}%</p>
            <p className="text-xs text-muted-foreground">Pass Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/tracking")}>
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">
                No recent activity for your team
              </p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((interview) => (
                  <div 
                    key={interview.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => navigate(`/review/${interview.id}`)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {interview.status === "Audit Passed" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                      )}
                      <span className="font-medium text-sm truncate">{interview.file_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {interview.is_re_audit && (
                        <Badge variant="outline" className="text-xs">Re-audit</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {interview.reviewed_at && format(new Date(interview.reviewed_at), "MMM d")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
              onClick={() => navigate("/interviews")}
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Upload New Interview
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => navigate("/tracking")}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Interview Tracking
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => navigate("/team-approvals")}
            >
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Management
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            {flaggedCount > 0 && (
              <Button 
                variant="outline" 
                className="w-full justify-between border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={() => navigate("/tracking?status=With Issues")}
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Flagged Issues
                </span>
                <Badge className="bg-orange-100 text-orange-700">{flaggedCount}</Badge>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FieldManagerDashboard;
