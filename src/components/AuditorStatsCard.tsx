import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Calendar, CalendarDays, Users } from "lucide-react";

interface AuditorStats {
  weekly: number;
  passed: number;
  failed: number;
  monthly: number;
  weeklyNames: number;
  passedNames: number;
  failedNames: number;
  monthlyNames: number;
}

export const AuditorStatsCard = () => {
  const { profile, userRole } = useAuth();
  
  const isAuditor = userRole === 'auditor' || userRole === 'admin' || userRole === 'super_admin';

  const { data: stats, isLoading } = useQuery({
    queryKey: ["auditor-stats", profile?.full_name],
    queryFn: async (): Promise<AuditorStats> => {
      if (!profile?.full_name) {
        return { weekly: 0, passed: 0, failed: 0, monthly: 0, weeklyNames: 0, passedNames: 0, failedNames: 0, monthlyNames: 0 };
      }

      // Get start of current week (Sunday)
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      // Get start of current month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Fetch weekly reviews with total names
      const { data: weeklyData } = await supabase
        .from("audits")
        .select("id, interview_metadata(total_names)")
        .eq("reviewed_by", profile.full_name)
        .gte("reviewed_at", startOfWeek.toISOString());

      const weeklyReviews = weeklyData?.length || 0;
      const weeklyNames = weeklyData?.reduce((sum, a) => {
        const meta = a.interview_metadata as { total_names: number | null }[] | null;
        return sum + (meta?.[0]?.total_names || 0);
      }, 0) || 0;

      // Fetch passed reviews with total names
      const { data: passedData } = await supabase
        .from("audits")
        .select("id, interview_metadata(total_names)")
        .eq("reviewed_by", profile.full_name)
        .eq("status", "Audit Passed");

      const passedReviews = passedData?.length || 0;
      const passedNames = passedData?.reduce((sum, a) => {
        const meta = a.interview_metadata as { total_names: number | null }[] | null;
        return sum + (meta?.[0]?.total_names || 0);
      }, 0) || 0;

      // Fetch failed reviews with total names
      const { data: failedData } = await supabase
        .from("audits")
        .select("id, interview_metadata(total_names)")
        .eq("reviewed_by", profile.full_name)
        .eq("status", "Audit Failed");

      const failedReviews = failedData?.length || 0;
      const failedNames = failedData?.reduce((sum, a) => {
        const meta = a.interview_metadata as { total_names: number | null }[] | null;
        return sum + (meta?.[0]?.total_names || 0);
      }, 0) || 0;

      // Fetch monthly reviews with total names
      const { data: monthlyData } = await supabase
        .from("audits")
        .select("id, interview_metadata(total_names)")
        .eq("reviewed_by", profile.full_name)
        .gte("reviewed_at", startOfMonth.toISOString());

      const monthlyReviews = monthlyData?.length || 0;
      const monthlyNames = monthlyData?.reduce((sum, a) => {
        const meta = a.interview_metadata as { total_names: number | null }[] | null;
        return sum + (meta?.[0]?.total_names || 0);
      }, 0) || 0;

      return {
        weekly: weeklyReviews,
        passed: passedReviews,
        failed: failedReviews,
        monthly: monthlyReviews,
        weeklyNames,
        passedNames,
        failedNames,
        monthlyNames,
      };
    },
    enabled: !!profile?.full_name && isAuditor,
  });

  if (!isAuditor) return null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const statCards = [
    {
      label: "This Week",
      value: stats?.weekly || 0,
      names: stats?.weeklyNames || 0,
      icon: CalendarDays,
      color: "text-primary",
      iconColor: "text-primary",
    },
    {
      label: "Passed",
      value: stats?.passed || 0,
      names: stats?.passedNames || 0,
      icon: CheckCircle2,
      color: "text-green-600",
      iconColor: "text-green-600",
    },
    {
      label: "Failed",
      value: stats?.failed || 0,
      names: stats?.failedNames || 0,
      icon: XCircle,
      color: "text-red-600",
      iconColor: "text-red-600",
    },
    {
      label: "This Month",
      value: stats?.monthly || 0,
      names: stats?.monthlyNames || 0,
      icon: Calendar,
      color: "text-foreground",
      iconColor: "text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      {statCards.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{stat.names.toLocaleString()} names</span>
                </div>
              </div>
              <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
