import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  CheckCircle2, 
  XCircle,
  Clock,
  TrendingUp,
  Users,
  FileText,
  ArrowRight,
  BarChart3,
  AlertTriangle
} from "lucide-react";
import RecentAchievementBadge from "@/components/RecentAchievementBadge";

const ContractorDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const contractorId = profile?.active_contractor_id || profile?.contractor_id;

  // Get overall stats
  const { data: stats } = useQuery({
    queryKey: ["contractor-stats", contractorId],
    queryFn: async () => {
      if (!contractorId) return { total: 0, passed: 0, failed: 0, pending: 0, reAudit: 0 };
      
      const { data, error } = await supabase
        .from("audits")
        .select("id, status, is_re_audit")
        .ilike("file_name", `${contractorId}%`);
      
      if (error) throw error;
      
      const audits = data || [];
      return {
        total: audits.length,
        passed: audits.filter(a => a.status === "Audit Passed").length,
        failed: audits.filter(a => a.status === "Audit Failed").length,
        pending: audits.filter(a => a.status === "Pending" || a.status === "Awaiting Review").length,
        reAudit: audits.filter(a => a.is_re_audit).length,
      };
    },
    enabled: !!contractorId,
  });

  // Get field managers count
  const { data: fieldManagersCount = 0 } = useQuery({
    queryKey: ["contractor-fm-count", contractorId],
    queryFn: async () => {
      if (!contractorId) return 0;
      
      const { data, error } = await supabase
        .from("team_assignments")
        .select("field_manager_id")
        .eq("contractor_id", contractorId)
        .eq("status", "approved");
      
      if (error) throw error;
      
      const uniqueManagers = new Set(data?.map(t => t.field_manager_id));
      return uniqueManagers.size;
    },
    enabled: !!contractorId,
  });

  // Get flagged issues count
  const { data: flaggedCount = 0 } = useQuery({
    queryKey: ["contractor-flagged", contractorId],
    queryFn: async () => {
      if (!contractorId) return 0;
      
      const { data, error } = await supabase
        .from("interview_assignments")
        .select("id, audits!inner(file_name)")
        .eq("is_flagged_for_issue", true)
        .is("issue_resolved_at", null);
      
      if (error) throw error;
      
      return (data || []).filter((item: any) => 
        item.audits?.file_name?.startsWith(contractorId)
      ).length;
    },
    enabled: !!contractorId,
  });

  const passRate = stats && (stats.passed + stats.failed) > 0
    ? Math.round((stats.passed / (stats.passed + stats.failed)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Contractor Dashboard</h3>
                <p className="text-muted-foreground">
                  {contractorId} • {fieldManagersCount} Field Managers
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/analytics")} className="gap-2">
              <BarChart3 className="h-4 w-4" />
              View Analytics
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Achievement */}
      <RecentAchievementBadge />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
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
            <Clock className="h-6 w-6 text-yellow-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{stats?.pending || 0}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{passRate}%</p>
            <p className="text-xs text-muted-foreground">Pass Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button 
              variant="outline" 
              className="w-full justify-between h-auto py-4"
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
              className="w-full justify-between h-auto py-4"
              onClick={() => navigate("/team-approvals")}
            >
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Approvals
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between h-auto py-4"
              onClick={() => navigate("/analytics")}
            >
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            {flaggedCount > 0 && (
              <Button 
                variant="outline" 
                className="w-full justify-between h-auto py-4 border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={() => navigate("/tracking?status=With Issues")}
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Flagged Issues
                </span>
                <Badge className="bg-orange-100 text-orange-700">{flaggedCount}</Badge>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Re-audits Alert */}
      {stats?.reAudit && stats.reAudit > 0 && (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="font-medium">Re-Audits Pending</p>
                  <p className="text-sm text-muted-foreground">
                    {stats.reAudit} interviews need attention
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate("/tracking?status=Awaiting Review")}
              >
                View All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ContractorDashboard;
