import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Calendar, FileText } from "lucide-react";

interface AuditActivity {
  id: string;
  file_name: string;
  status: string;
  reviewed_at: string;
  review_comment: string | null;
  action_plan: string | null;
}

interface ReviewStats {
  total: number;
  passed: number;
  failed: number;
  monthly: number;
}

const UserProfile = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [recentActivities, setRecentActivities] = useState<AuditActivity[]>([]);
  const [stats, setStats] = useState<ReviewStats>({ total: 0, passed: 0, failed: 0, monthly: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.full_name) return;

      setLoading(true);
      try {
        // Fetch recent activities
        const { data: activities } = await supabase
          .from("audits")
          .select("id, file_name, status, reviewed_at, review_comment, action_plan")
          .eq("reviewed_by", profile.full_name)
          .not("reviewed_at", "is", null)
          .order("reviewed_at", { ascending: false })
          .limit(10);

        setRecentActivities(activities || []);

        // Fetch statistics
        const { count: totalReviews } = await supabase
          .from("audits")
          .select("*", { count: "exact", head: true })
          .eq("reviewed_by", profile.full_name)
          .not("reviewed_at", "is", null);

        const { count: passedReviews } = await supabase
          .from("audits")
          .select("*", { count: "exact", head: true })
          .eq("reviewed_by", profile.full_name)
          .eq("status", "Audit Passed");

        const { count: failedReviews } = await supabase
          .from("audits")
          .select("*", { count: "exact", head: true })
          .eq("reviewed_by", profile.full_name)
          .eq("status", "Audit Failed");

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const { count: monthlyReviews } = await supabase
          .from("audits")
          .select("*", { count: "exact", head: true })
          .eq("reviewed_by", profile.full_name)
          .gte("reviewed_at", startOfMonth.toISOString());

        setStats({
          total: totalReviews || 0,
          passed: passedReviews || 0,
          failed: failedReviews || 0,
          monthly: monthlyReviews || 0,
        });
      } catch (error) {
        console.error("Error fetching profile data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.full_name]);

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Profile Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">{profile?.full_name}</h1>
        <p className="text-muted-foreground capitalize">{profile?.contractor_id}</p>
      </div>

      <Separator />

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="text-foreground">{profile?.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="text-foreground">{profile?.phone}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Contractor ID</p>
              <p className="text-foreground">{profile?.contractor_id}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Account Status</p>
              <Badge variant={profile?.is_approved ? "default" : "secondary"}>
                {profile?.is_approved ? "Approved" : "Pending Approval"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Reviews</p>
                <p className="text-3xl font-bold text-foreground">{stats.total}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Passed</p>
                <p className="text-3xl font-bold text-green-600">{stats.passed}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-3xl font-bold text-red-600">{stats.failed}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-3xl font-bold text-foreground">{stats.monthly}</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activities */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activities</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivities.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No review activities yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Interview</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Review Date</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentActivities.map((activity) => (
                    <TableRow
                      key={activity.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/review/${activity.id}`)}
                    >
                      <TableCell className="font-medium">{activity.file_name}</TableCell>
                      <TableCell>
                        <Badge variant={activity.status === "Audit Passed" ? "default" : "destructive"}>
                          {activity.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {activity.reviewed_at && format(new Date(activity.reviewed_at), "PPp")}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {activity.review_comment || activity.action_plan || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserProfile;
