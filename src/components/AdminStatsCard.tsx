import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FileText, Users } from "lucide-react";

export const AdminStatsCard = () => {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-interview-stats"],
    queryFn: async () => {
      // Get total interview count
      const { count: totalInterviews } = await supabase
        .from("audits")
        .select("*", { count: "exact", head: true });

      // Get total names from metadata
      const { data: metadata } = await supabase
        .from("interview_metadata")
        .select("total_names");

      const totalNames = metadata?.reduce((sum, m) => sum + (m.total_names || 0), 0) || 0;

      return {
        totalInterviews: totalInterviews || 0,
        totalNames,
      };
    },
    enabled: isAdmin,
  });

  // Only render for admins
  if (!isAdmin) return null;

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 mb-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Uploaded Interviews</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.totalInterviews?.toLocaleString() || 0}</div>
          <p className="text-xs text-muted-foreground">All time uploads</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Names Collected</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats?.totalNames?.toLocaleString() || 0}</div>
          <p className="text-xs text-muted-foreground">From all interviews with metadata</p>
        </CardContent>
      </Card>
    </div>
  );
};