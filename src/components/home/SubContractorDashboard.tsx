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
  XCircle
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

  // Get stats for ALL interviews under the contractor ID (like super admin but scoped)
  // Include interviews without metadata by extracting contractor_id from file_name
  // Also include total_names for each stat category
  const { data: stats } = useQuery({
    queryKey: ["subcontractor-stats", profile?.contractor_id],
    queryFn: async () => {
      const contractorId = profile?.active_contractor_id || profile?.contractor_id;
      if (!contractorId) {
        return { 
          total: 0, passed: 0, failed: 0, pending: 0, noMetadata: 0,
          totalNamesTotal: 0, totalNamesPassed: 0, totalNamesFailed: 0, totalNamesPending: 0
        };
      }
      
      // Fetch ALL audits with metadata for this contractor, including total_names
      const { data: auditsWithMeta } = await supabase
        .from("audits")
        .select(`
          id,
          file_name,
          status,
          interview_metadata(contractor_id, total_names)
        `);
      
      // Filter by contractor ID - use metadata if available, otherwise extract from file_name
      const contractorAudits = (auditsWithMeta || []).filter(audit => {
        const meta = (audit.interview_metadata as any[])?.[0];
        if (meta?.contractor_id) {
          return meta.contractor_id === contractorId;
        }
        // Extract contractor_id from file_name (format: NG71_711_20251208_0937)
        const fileNameParts = audit.file_name?.split('_') || [];
        return fileNameParts[0] === contractorId;
      });
      
      // Calculate totals and total_names for each status
      const passedAudits = contractorAudits.filter(a => a.status === "Audit Passed");
      const failedAudits = contractorAudits.filter(a => a.status === "Audit Failed");
      const pendingAudits = contractorAudits.filter(a => a.status === "Pending" || a.status === "Awaiting Review");
      
      const getTotalNames = (audits: typeof contractorAudits) => 
        audits.reduce((sum, a) => sum + ((a.interview_metadata as any[])?.[0]?.total_names || 0), 0);
      
      return {
        total: contractorAudits.length,
        passed: passedAudits.length,
        failed: failedAudits.length,
        pending: pendingAudits.length,
        noMetadata: contractorAudits.filter(a => !(a.interview_metadata as any[])?.[0]).length,
        totalNamesTotal: getTotalNames(contractorAudits),
        totalNamesPassed: getTotalNames(passedAudits),
        totalNamesFailed: getTotalNames(failedAudits),
        totalNamesPending: getTotalNames(pendingAudits),
      };
    },
    enabled: !!profile?.contractor_id,
  });

  // Get flagged issues for ALL interviews under contractor
  const { data: flaggedCount = 0 } = useQuery({
    queryKey: ["subcontractor-flagged", profile?.contractor_id],
    queryFn: async () => {
      const contractorId = profile?.active_contractor_id || profile?.contractor_id;
      if (!contractorId) return 0;
      
      // Get flagged assignments
      const { data: flaggedAssignments } = await supabase
        .from("interview_assignments")
        .select(`
          id,
          audit_id,
          is_flagged_for_issue,
          issue_resolved_at
        `)
        .eq("is_flagged_for_issue", true)
        .is("issue_resolved_at", null);
      
      if (!flaggedAssignments || flaggedAssignments.length === 0) return 0;
      
      // Get metadata for these audits
      const auditIds = flaggedAssignments.map(a => a.audit_id);
      const { data: metadata } = await supabase
        .from("interview_metadata")
        .select("audit_id, contractor_id")
        .in("audit_id", auditIds);
      
      // Filter by contractor only
      return (metadata || []).filter(m => m.contractor_id === contractorId).length;
    },
    enabled: !!profile?.contractor_id,
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
            <p className="text-xs text-muted-foreground">Total Interviews</p>
            <p className="text-sm font-medium text-primary mt-1">
              {(stats?.totalNamesTotal || 0).toLocaleString()} names
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{stats?.passed || 0}</p>
            <p className="text-xs text-muted-foreground">Passed</p>
            <p className="text-sm font-medium text-green-600 mt-1">
              {(stats?.totalNamesPassed || 0).toLocaleString()} names
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <XCircle className="h-6 w-6 text-red-600 mx-auto mb-2" />
            <p className="text-2xl font-bold">{stats?.failed || 0}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-sm font-medium text-red-600 mt-1">
              {(stats?.totalNamesFailed || 0).toLocaleString()} names
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-6 w-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">{passRate}%</p>
            <p className="text-xs text-muted-foreground">Pass Rate</p>
            <p className="text-sm font-medium text-muted-foreground mt-1">
              {(stats?.totalNamesPending || 0).toLocaleString()} pending
            </p>
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
              onClick={() => navigate("/interview-tracking")}
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
