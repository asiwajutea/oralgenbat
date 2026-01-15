import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  AlertTriangle,
  ChevronDown,
  Activity,
  UserCheck,
} from "lucide-react";
import RecentAchievementBadge from "@/components/RecentAchievementBadge";
import { format } from "date-fns";
import { useState } from "react";

const ContractorDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [fmPerfOpen, setFmPerfOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  
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

  // Get field managers with stats
  const { data: fieldManagerStats = [] } = useQuery({
    queryKey: ["contractor-fm-stats", contractorId],
    queryFn: async () => {
      if (!contractorId) return [];
      
      // Get all approved team assignments
      const { data: teams, error: teamsError } = await supabase
        .from("team_assignments")
        .select(`
          field_manager_id,
          interviewer_code,
          profiles!team_assignments_field_manager_id_fkey(full_name)
        `)
        .eq("contractor_id", contractorId)
        .eq("status", "approved");
      
      if (teamsError) throw teamsError;
      
      // Get all audits for this contractor
      const { data: audits, error: auditsError } = await supabase
        .from("audits")
        .select("file_name, status")
        .ilike("file_name", `${contractorId}%`);
      
      if (auditsError) throw auditsError;
      
      // Group by field manager
      const fmMap = new Map<string, { name: string; codes: Set<string>; passed: number; failed: number; total: number }>();
      
      teams?.forEach((t: any) => {
        const fmId = t.field_manager_id;
        if (!fmMap.has(fmId)) {
          fmMap.set(fmId, { 
            name: t.profiles?.full_name || "Unknown", 
            codes: new Set(), 
            passed: 0, 
            failed: 0, 
            total: 0 
          });
        }
        fmMap.get(fmId)!.codes.add(t.interviewer_code);
      });
      
      // Count audits per FM
      audits?.forEach((audit) => {
        const parts = audit.file_name.split('_');
        if (parts.length >= 2) {
          const code = parts[1];
          fmMap.forEach((fm) => {
            if (fm.codes.has(code)) {
              fm.total++;
              if (audit.status === "Audit Passed") fm.passed++;
              if (audit.status === "Audit Failed") fm.failed++;
            }
          });
        }
      });
      
      // Convert to array and calculate pass rate
      const result = Array.from(fmMap.entries()).map(([id, fm]) => ({
        id,
        name: fm.name,
        total: fm.total,
        passed: fm.passed,
        failed: fm.failed,
        passRate: fm.passed + fm.failed > 0 ? Math.round((fm.passed / (fm.passed + fm.failed)) * 100) : 0,
        agentCount: fm.codes.size,
      }));
      
      // Sort by pass rate descending
      return result.sort((a, b) => b.passRate - a.passRate);
    },
    enabled: !!contractorId,
  });

  // Get pending approval count
  const { data: pendingApprovalsCount = 0 } = useQuery({
    queryKey: ["contractor-pending-approvals", contractorId],
    queryFn: async () => {
      if (!contractorId) return 0;
      
      const { count, error } = await supabase
        .from("team_assignments")
        .select("id", { count: "exact", head: true })
        .eq("contractor_id", contractorId)
        .eq("status", "pending");
      
      if (error) throw error;
      return count || 0;
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

  // Get recent activity
  const { data: recentActivity = [] } = useQuery({
    queryKey: ["contractor-recent-activity", contractorId],
    queryFn: async () => {
      if (!contractorId) return [];
      
      const { data, error } = await supabase
        .from("audits")
        .select("id, file_name, status, reviewed_at")
        .ilike("file_name", `${contractorId}%`)
        .not("reviewed_at", "is", null)
        .order("reviewed_at", { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!contractorId,
  });

  const passRate = stats && (stats.passed + stats.failed) > 0
    ? Math.round((stats.passed / (stats.passed + stats.failed)) * 100)
    : 0;

  const totalAgents = fieldManagerStats.reduce((acc, fm) => acc + fm.agentCount, 0);

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
                  {contractorId} • {fieldManagerStats.length} Field Managers
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

      {/* Team Overview & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Overview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-3 bg-muted/50 rounded-lg">
                <UserCheck className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold">{fieldManagerStats.length}</p>
                <p className="text-xs text-muted-foreground">Field Managers</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <Users className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold">{totalAgents}</p>
                <p className="text-xs text-muted-foreground">Total Agents</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <Clock className="h-5 w-5 text-orange-500 mx-auto mb-1" />
                <p className="text-xl font-bold">{pendingApprovalsCount}</p>
                <p className="text-xs text-muted-foreground">Pending Approvals</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                {pendingApprovalsCount > 0 && (
                  <Badge variant="destructive">{pendingApprovalsCount}</Badge>
                )}
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
      </div>

      {/* Field Manager Performance */}
      <Collapsible open={fmPerfOpen} onOpenChange={setFmPerfOpen}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Field Manager Performance
                </span>
                <ChevronDown className={`h-5 w-5 transition-transform ${fmPerfOpen ? "rotate-180" : ""}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {fieldManagerStats.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No field managers with data yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field Manager</TableHead>
                      <TableHead className="text-center">Agents</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Passed</TableHead>
                      <TableHead className="text-center">Failed</TableHead>
                      <TableHead className="text-center">Pass Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fieldManagerStats.slice(0, 10).map((fm) => (
                      <TableRow key={fm.id}>
                        <TableCell className="font-medium">{fm.name}</TableCell>
                        <TableCell className="text-center">{fm.agentCount}</TableCell>
                        <TableCell className="text-center">{fm.total}</TableCell>
                        <TableCell className="text-center text-green-600">{fm.passed}</TableCell>
                        <TableCell className="text-center text-red-600">{fm.failed}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={fm.passRate >= 80 ? "default" : fm.passRate >= 60 ? "secondary" : "destructive"}>
                            {fm.passRate}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Recent Activity */}
      <Collapsible open={recentOpen} onOpenChange={setRecentOpen}>
        <Card>
          <CollapsibleTrigger className="w-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Activity
                </span>
                <ChevronDown className={`h-5 w-5 transition-transform ${recentOpen ? "rotate-180" : ""}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No recent activity.</p>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((audit) => (
                    <div key={audit.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {audit.status === "Audit Passed" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{audit.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {audit.reviewed_at && format(new Date(audit.reviewed_at), "MMM d, yyyy h:mm a")}
                          </p>
                        </div>
                      </div>
                      <Badge variant={audit.status === "Audit Passed" ? "default" : "destructive"}>
                        {audit.status === "Audit Passed" ? "Passed" : "Failed"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

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
