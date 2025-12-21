import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Calendar, FileText, Edit2, Save, X, Lock, CalendarDays } from "lucide-react";
import { z } from "zod";

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name must be less than 100 characters"),
  phone: z.string().trim().regex(/^[\d\s\-\+\(\)]+$/, "Invalid phone format").max(20, "Phone must be less than 20 characters"),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

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
  weekly: number;
}

const UserProfile = () => {
  const { profile, userRole, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [recentActivities, setRecentActivities] = useState<AuditActivity[]>([]);
  const [stats, setStats] = useState<ReviewStats>({ total: 0, passed: 0, failed: 0, monthly: 0, weekly: 0 });
  const [loading, setLoading] = useState(true);
  
  // Profile editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedFullName, setEditedFullName] = useState("");
  const [editedPhone, setEditedPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  // Password update state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

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

        // Get start of current week (Sunday)
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const { count: weeklyReviews } = await supabase
          .from("audits")
          .select("*", { count: "exact", head: true })
          .eq("reviewed_by", profile.full_name)
          .gte("reviewed_at", startOfWeek.toISOString());

        setStats({
          total: totalReviews || 0,
          passed: passedReviews || 0,
          failed: failedReviews || 0,
          monthly: monthlyReviews || 0,
          weekly: weeklyReviews || 0,
        });
      } catch (error) {
        console.error("Error fetching profile data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.full_name]);

  const handleEditToggle = () => {
    if (!isEditing) {
      setEditedFullName(profile?.full_name || "");
      setEditedPhone(profile?.phone || "");
    }
    setIsEditing(!isEditing);
  };

  const handleSaveProfile = async () => {
    try {
      const validationResult = profileSchema.safeParse({
        full_name: editedFullName,
        phone: editedPhone,
      });

      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        toast({
          title: "Validation Error",
          description: firstError.message,
          variant: "destructive",
        });
        return;
      }

      setIsSaving(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editedFullName.trim(),
          phone: editedPhone.trim(),
        })
        .eq("id", profile?.id);

      if (error) throw error;

      await refreshProfile();
      setIsEditing(false);
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordUpdate = async () => {
    try {
      const validationResult = passwordSchema.safeParse({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        toast({
          title: "Validation Error",
          description: firstError.message,
          variant: "destructive",
        });
        return;
      }

      setIsUpdatingPassword(true);

      // Verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email || "",
        password: currentPassword,
      });

      if (signInError) {
        throw new Error("Current password is incorrect");
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      // Clear form
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      toast({
        title: "Password Updated",
        description: "Your password has been successfully changed.",
      });
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const formatRole = (role: string | null) => {
    if (!role) return "User";
    return role.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  };

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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Personal Information</CardTitle>
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={handleEditToggle}>
              <Edit2 className="h-4 w-4 mr-2" />
              Edit Profile
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    value={editedFullName}
                    onChange={(e) => setEditedFullName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={editedPhone}
                    onChange={(e) => setEditedPhone(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <p className="text-sm text-muted-foreground mt-2">{profile?.email} (read-only)</p>
                </div>
                <div>
                  <Label>Contractor ID</Label>
                  <p className="text-sm text-muted-foreground mt-2">{profile?.contractor_id} (read-only)</p>
                </div>
                <div>
                  <Label>Role</Label>
                  <div className="mt-2">
                    <Badge variant="outline" className="capitalize">
                      {formatRole(userRole)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label>Account Status</Label>
                  <div className="mt-2">
                    <Badge variant={profile?.is_approved ? "default" : "secondary"}>
                      {profile?.is_approved ? "Approved" : "Pending Approval"}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={handleEditToggle} disabled={isSaving}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={handleSaveProfile} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Full Name</p>
                <p className="text-foreground">{profile?.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="text-foreground">{profile?.phone}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="text-foreground">{profile?.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Contractor ID</p>
                <p className="text-foreground">{profile?.contractor_id}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Role</p>
                <Badge variant="outline" className="capitalize">
                  {formatRole(userRole)}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Account Status</p>
                <Badge variant={profile?.is_approved ? "default" : "secondary"}>
                  {profile?.is_approved ? "Approved" : "Pending Approval"}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Security Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-w-md">
            <div>
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <div>
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 8 characters)"
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
            <Button 
              onClick={handlePasswordUpdate} 
              disabled={isUpdatingPassword || !currentPassword || !newPassword || !confirmPassword}
            >
              <Lock className="h-4 w-4 mr-2" />
              {isUpdatingPassword ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-3xl font-bold text-primary">{stats.weekly}</p>
              </div>
              <CalendarDays className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

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
