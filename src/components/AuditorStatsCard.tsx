import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Calendar, CalendarDays } from "lucide-react";

interface AuditorStats {
  weekly: number;
  passed: number;
  failed: number;
  monthly: number;
}

export const AuditorStatsCard = () => {
  const { profile, userRole } = useAuth();
  
  const isAuditor = userRole === 'auditor' || userRole === 'admin' || userRole === 'super_admin';

  const { data: stats, isLoading } = useQuery({
    queryKey: ["auditor-stats", profile?.full_name],
    queryFn: async (): Promise<AuditorStats> => {
      if (!profile?.full_name) {
        return { weekly: 0, passed: 0, failed: 0, monthly: 0 };
      }

      // Get start of current week (Sunday)
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      // Get start of current month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Fetch weekly reviews
      const { count: weeklyReviews } = await supabase
        .from("audits")
        .select("*", { count: "exact", head: true })
        .eq("reviewed_by", profile.full_name)
        .gte("reviewed_at", startOfWeek.toISOString());

      // Fetch passed reviews (all-time)
      const { count: passedReviews } = await supabase
        .from("audits")
        .select("*", { count: "exact", head: true })
        .eq("reviewed_by", profile.full_name)
        .eq("status", "Audit Passed");

      // Fetch failed reviews (all-time)
      const { count: failedReviews } = await supabase
        .from("audits")
        .select("*", { count: "exact", head: true })
        .eq("reviewed_by", profile.full_name)
        .eq("status", "Audit Failed");

      // Fetch monthly reviews
      const { count: monthlyReviews } = await supabase
        .from("audits")
        .select("*", { count: "exact", head: true })
        .eq("reviewed_by", profile.full_name)
        .gte("reviewed_at", startOfMonth.toISOString());

      return {
        weekly: weeklyReviews || 0,
        passed: passedReviews || 0,
        failed: failedReviews || 0,
        monthly: monthlyReviews || 0,
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
      icon: CalendarDays,
      color: "text-primary",
      iconColor: "text-primary",
    },
    {
      label: "Passed",
      value: stats?.passed || 0,
      icon: CheckCircle2,
      color: "text-green-600",
      iconColor: "text-green-600",
    },
    {
      label: "Failed",
      value: stats?.failed || 0,
      icon: XCircle,
      color: "text-red-600",
      iconColor: "text-red-600",
    },
    {
      label: "This Month",
      value: stats?.monthly || 0,
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
              </div>
              <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
