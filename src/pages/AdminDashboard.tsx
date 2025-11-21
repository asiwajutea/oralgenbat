import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, Clock } from "lucide-react";
import { format } from "date-fns";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  contractor_id: string;
  is_approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  role?: string;
  approved_by_name?: string;
}

const AdminDashboard = () => {
  const { user, userRole } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Fetch approver names
      const approverIds = profilesData
        ?.filter(p => p.approved_by)
        .map(p => p.approved_by)
        .filter(Boolean) || [];

      let approversMap: Record<string, string> = {};
      if (approverIds.length > 0) {
        const { data: approversData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", approverIds);

        approversMap = (approversData || []).reduce((acc, approver) => {
          acc[approver.id] = approver.full_name;
          return acc;
        }, {} as Record<string, string>);
      }

      // Combine data
      const rolesMap = (rolesData || []).reduce((acc, role) => {
        acc[role.user_id] = role.role;
        return acc;
      }, {} as Record<string, string>);

      const combinedData = (profilesData || []).map(profile => ({
        ...profile,
        role: rolesMap[profile.id] || "user",
        approved_by_name: profile.approved_by ? approversMap[profile.approved_by] : undefined,
      }));

      setUsers(combinedData);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const approveUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_approved: true,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "User approved successfully",
      });

      fetchUsers();
    } catch (error) {
      console.error("Error approving user:", error);
      toast({
        title: "Error",
        description: "Failed to approve user",
        variant: "destructive",
      });
    }
  };

  const canModifyUser = (targetUserId: string) => {
    if (user?.id === targetUserId) {
      toast({
        title: "Action Not Allowed",
        description: "You cannot modify your own account",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    if (!canModifyUser(userId)) return;

    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole as any })
        .eq("user_id", userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `User role updated to ${formatRole(newRole)}`,
      });

      fetchUsers();
    } catch (error) {
      console.error("Error updating user role:", error);
      toast({
        title: "Error",
        description: "Failed to update user role. You may not have permission.",
        variant: "destructive",
      });
    }
  };

  const confirmRevokeAccess = (targetUser: UserProfile) => {
    if (!canModifyUser(targetUser.id)) return;
    setSelectedUser(targetUser);
    setShowRevokeDialog(true);
  };

  const revokeUserAccess = async () => {
    if (!selectedUser) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          is_approved: false,
          approved_by: null,
          approved_at: null,
        })
        .eq("id", selectedUser.id);

      if (error) throw error;

      toast({
        title: "Access Revoked",
        description: `${selectedUser.full_name}'s access has been revoked`,
      });

      setShowRevokeDialog(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error("Error revoking access:", error);
      toast({
        title: "Error",
        description: "Failed to revoke user access",
        variant: "destructive",
      });
    }
  };

  const formatRole = (role: string) => {
    return role.split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  };

  const filteredUsers = users.filter((user) => {
    if (filter === "pending") return !user.is_approved;
    if (filter === "approved") return user.is_approved;
    return true;
  });

  const pendingCount = users.filter((u) => !u.is_approved).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>
              Manage user accounts and approve pending registrations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList className="grid w-full grid-cols-3 mb-6">
                <TabsTrigger value="all">
                  All Users
                  <Badge variant="secondary" className="ml-2">
                    {users.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending Approval
                  {pendingCount > 0 && (
                    <Badge variant="default" className="ml-2 bg-yellow-500 hover:bg-yellow-600">
                      {pendingCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
              </TabsList>

              <TabsContent value={filter} className="space-y-4">
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-lg">No users found</p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Contractor ID</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right space-x-2">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.full_name}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>{user.phone}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{user.contractor_id}</Badge>
                            </TableCell>
                            <TableCell>
                              {userRole === 'super_admin' ? (
                                <Select
                                  value={user.role || "user"}
                                  onValueChange={(newRole) => updateUserRole(user.id, newRole)}
                                  disabled={user.id === user?.id}
                                >
                                  <SelectTrigger className="w-40">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="field_manager">Field Manager</SelectItem>
                                    <SelectItem value="auditor">Auditor</SelectItem>
                                    <SelectItem value="contractor">Contractor</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="super_admin">Super Admin</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span>{formatRole(user.role || "user")}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {user.is_approved ? (
                                <div className="space-y-1">
                                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                    <CheckCircle className="mr-1 h-3 w-3" />
                                    Approved
                                  </Badge>
                                  {user.approved_at && (
                                    <p className="text-xs text-muted-foreground">
                                      {user.approved_by_name && `by ${user.approved_by_name} `}
                                      on {format(new Date(user.approved_at), "MMM d, yyyy")}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                                  <Clock className="mr-1 h-3 w-3" />
                                  Pending
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                              {!user.is_approved ? (
                                <Button
                                  size="sm"
                                  onClick={() => approveUser(user.id)}
                                >
                                  Approve
                                </Button>
                              ) : (
                                userRole === 'super_admin' && (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => confirmRevokeAccess(user)}
                                  >
                                    Revoke Access
                                  </Button>
                                )
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke User Access?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke access for <strong>{selectedUser?.full_name}</strong>.
              They will no longer be able to access the system until re-approved.
              This action can be reversed by approving them again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={revokeUserAccess} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDashboard;
