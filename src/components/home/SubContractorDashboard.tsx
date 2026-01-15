import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  Users, 
  TrendingUp,
  BarChart3,
  AlertTriangle,
  FileText,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock
} from "lucide-react";
import RecentAchievementBadge from "@/components/RecentAchievementBadge";

const SubContractorDashboard = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  // Get assigned field managers
  const { data: assignedManagers = [] } = useQuery({
    queryKey: ["subcontractor-assigned-managers", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // First get the assignments
      const { data: assignments, error } = await supabase
        .from("field_manager_subcontractor_assignments")
        .select("field_manager_id")
        .eq("sub_contractor_id", user.id)
        .eq("is_active", true);
      
      if (error) throw error;
      if (!assignments || assignments.length === 0) return [];
      
      // Use RPC to get field manager names (bypasses RLS)
      const fmIds = assignments.map(a => a.field_manager_id);
      const profilePromises = fmIds.map(async (fmId) => {
        const { data: name } = await supabase.rpc("get_user_display_name", { 
          _user_id: fmId 
        });
        return { id: fmId, full_name: name || "Unknown" };
      });
      const profiles = await Promise.all(profilePromises);
      
      // Combine the data
      return assignments.map(a => ({
        field_manager_id: a.field_manager_id,
        full_name: profiles.find(p => p.id === a.field_manager_id)?.full_name || "Unknown"
      }));
    },
    enabled: !!user?.id,
  });

  // Get stats for assigned teams
  const { data: stats } = useQuery({
    queryKey: ["subcontractor-stats", assignedManagers],
    queryFn: async () => {
      if (assignedManagers.length === 0) {
        return { total: 0, passed: 0, failed: 0, pending: 0 };
      }
      
      const managerIds = assignedManagers.map((m: any) => m.field_manager_id);
      
      // Get team codes for these managers
      const { data: teamAssignments } = await supabase
        .from("team_assignments")
        .select("interviewer_code")
        .in("field_manager_id", managerIds)
        .eq("status", "approved");
      
      const teamCodes = teamAssignments?.map(t => t.interviewer_code) || [];
      
      if (teamCodes.length === 0) {
        return { total: 0, passed: 0, failed: 0, pending: 0 };
      }
      
      const { data: audits } = await supabase
        .from("audits")
        .select("id, file_name, status");
      
      const teamAudits = (audits || []).filter(audit => {
        const parts = audit.file_name.split('_');
        return parts.length >= 2 && teamCodes.includes(parts[1]);
      });
      
      return {
        total: teamAudits.length,
        passed: teamAudits.filter(a => a.status === "Audit Passed").length,
        failed: teamAudits.filter(a => a.status === "Audit Failed").length,
        pending: teamAudits.filter(a => a.status === "Pending" || a.status === "Awaiting Review").length,
      };
    },
    enabled: assignedManagers.length > 0,
  });

  // Get flagged issues for assigned teams
  const { data: flaggedCount = 0 } = useQuery({
    queryKey: ["subcontractor-flagged", assignedManagers],
    queryFn: async () => {
      if (assignedManagers.length === 0) return 0;
      
      const managerIds = assignedManagers.map((m: any) => m.field_manager_id);
      
      const { data: teamAssignments } = await supabase
        .from("team_assignments")
        .select("interviewer_code")
        .in("field_manager_id", managerIds)
        .eq("status", "approved");
      
      const teamCodes = teamAssignments?.map(t => t.interviewer_code) || [];
      
      if (teamCodes.length === 0) return 0;
      
      const { data } = await supabase
        .from("interview_assignments")
        .select("id, audits!inner(file_name)")
        .eq("is_flagged_for_issue", true)
        .is("issue_resolved_at", null);
      
      return (data || []).filter((item: any) => {
        const parts = item.audits?.file_name?.split('_') || [];
        return parts.length >= 2 && teamCodes.includes(parts[1]);
      }).length;
    },
    enabled: assignedManagers.length > 0,
  });

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
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Sub-Contractor Dashboard</h3>
                <p className="text-muted-foreground">
                  Managing {assignedManagers.length} Field Managers
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/my-analytics")} className="gap-2">
              <BarChart3 className="h-4 w-4" />
              View Analytics
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Achievement */}
      <RecentAchievementBadge />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-2xl font-bold">{stats?.total || 0}</p>
            <p className="text-xs text-muted-foreground">Total</p>
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
            <TrendingUp className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{passRate}%</p>
            <p className="text-xs text-muted-foreground">Pass Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assigned Field Managers */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Assigned Field Managers
              </CardTitle>
              <Badge variant="secondary">{assignedManagers.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {assignedManagers.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">
                No field managers assigned yet
              </p>
            ) : (
              <div className="space-y-2">
                {assignedManagers.slice(0, 5).map((manager: any) => (
                  <div 
                    key={manager.field_manager_id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">
                        {manager.full_name}
                      </span>
                    </div>
                  </div>
                ))}
                {assignedManagers.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    +{assignedManagers.length - 5} more
                  </p>
                )}
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
              onClick={() => navigate("/subcontractor-team-management")}
            >
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Management
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
              onClick={() => navigate("/admin")}
            >
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Manage Users
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => navigate("/my-analytics")}
            >
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                My Analytics
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

export default SubContractorDashboard;
