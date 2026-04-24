import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  FileText,
  ArrowRight,
  PlayCircle
} from "lucide-react";
import { format, subHours } from "date-fns";
import { AuditorStatsCard } from "@/components/AuditorStatsCard";
import RecentAchievementBadge from "@/components/RecentAchievementBadge";
import PaymentStatsCards from "@/components/home/PaymentStatsCards";

const AuditorDashboard = () => {
  const navigate = useNavigate();
  const { profile, user } = useAuth();

  // Burned audit IDs to exclude from lists/counts
  const { data: burnedIds = [] } = useQuery({
    queryKey: ["burned-audit-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("burn_queue")
        .select("audit_id")
        .is("restored_at", null);
      return (data || []).map((b: any) => b.audit_id);
    },
    staleTime: 60_000,
  });
  const burnedSet = new Set(burnedIds);

  // Get interviews approved in last 24 hours - auditor's own
  const { data: recentlyApproved = [] } = useQuery({
    queryKey: ["auditor-approved-24h", profile?.full_name],
    queryFn: async () => {
      if (!profile?.full_name) return [];
      const twentyFourHoursAgo = subHours(new Date(), 24).toISOString();
      
      const { data, error } = await supabase
        .from("audits")
        .select("id, file_name, reviewed_at")
        .eq("status", "Audit Passed")
        .eq("reviewed_by", profile.full_name)
        .gte("reviewed_at", twentyFourHoursAgo)
        .order("reviewed_at", { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.full_name,
  });

  // Get interviews in progress (locked by this auditor)
  const { data: inProgressInterviews = [] } = useQuery({
    queryKey: ["auditor-in-progress", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from("audits")
        .select("id, file_name, locked_at")
        .eq("locked_by", user.id)
        .gte("locked_at", oneHourAgo)
        .order("locked_at", { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Get re-audit interviews for this auditor
  const { data: reAuditInterviews = [] } = useQuery({
    queryKey: ["auditor-re-audits", profile?.full_name],
    queryFn: async () => {
      if (!profile?.full_name) return [];
      
      const { data, error } = await supabase
        .from("audits")
        .select("id, file_name, re_audit_count, last_modified")
        .eq("is_re_audit", true)
        .eq("status", "Awaiting Review")
        .eq("reviewed_by", profile.full_name)
        .order("last_modified", { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.full_name,
  });

  // Get pending interviews count
  const { data: pendingIds = [] } = useQuery({
    queryKey: ["auditor-pending-ids", profile?.active_contractor_id || profile?.contractor_id],
    queryFn: async () => {
      const contractorId = profile?.active_contractor_id || profile?.contractor_id;
      if (!contractorId) return [] as { id: string }[];

      const { data, error } = await supabase
        .from("audits")
        .select("id")
        .eq("status", "Pending")
        .ilike("file_name", `${contractorId}%`);

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile,
  });

  // Apply burn-queue filtering to all derived lists
  const visibleRecentlyApproved = recentlyApproved.filter((a: any) => !burnedSet.has(a.id));
  const visibleInProgress = inProgressInterviews.filter((a: any) => !burnedSet.has(a.id));
  const visibleReAudits = reAuditInterviews.filter((a: any) => !burnedSet.has(a.id));
  const pendingCount = pendingIds.filter((a: any) => !burnedSet.has(a.id)).length;

  return (
    <div className="space-y-6">
      {/* Quick Start Card */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <PlayCircle className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Ready to Audit</h3>
                <p className="text-muted-foreground">
                  {pendingCount} interviews waiting in queue
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/interviews")} size="lg" className="gap-2">
              Start Auditing
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Achievement */}
      <RecentAchievementBadge />

      {/* Stats Card */}
      <AuditorStatsCard />

      {/* Payment Stats */}
      <PaymentStatsCards />

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Approved (24h) */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <CardTitle className="text-lg">Approved (24h)</CardTitle>
              </div>
              <Badge className="bg-green-100 text-green-700">{recentlyApproved.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {recentlyApproved.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">
                No interviews approved in the last 24 hours
              </p>
            ) : (
              <div className="space-y-2">
                {recentlyApproved.map((interview) => (
                  <div 
                    key={interview.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => navigate(`/review/${interview.id}`)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium text-sm truncate">{interview.file_name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {interview.reviewed_at && format(new Date(interview.reviewed_at), "h:mm a")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* In Progress */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">In Progress</CardTitle>
              </div>
              <Badge className="bg-blue-100 text-blue-700">{inProgressInterviews.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {inProgressInterviews.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">
                No interviews currently in progress
              </p>
            ) : (
              <div className="space-y-2">
                {inProgressInterviews.map((interview) => (
                  <div 
                    key={interview.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => navigate(`/review/${interview.id}`)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                      <span className="font-medium text-sm truncate">{interview.file_name}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Re-Audits */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <CardTitle className="text-lg">Re-Audits</CardTitle>
              </div>
              <Badge className="bg-orange-100 text-orange-700">{reAuditInterviews.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {reAuditInterviews.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">
                No pending re-audits
              </p>
            ) : (
              <div className="space-y-2">
                {reAuditInterviews.map((interview) => (
                  <div 
                    key={interview.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => navigate(`/review/${interview.id}`)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span className="font-medium text-sm truncate">{interview.file_name}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">#{interview.re_audit_count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AuditorDashboard;
