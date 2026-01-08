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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, Clock, Trash2, Bell, X, Circle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

interface UserPresence {
  user_id: string;
  is_online: boolean;
  last_seen_at: string | null;
  session_started_at: string | null;
  last_session_duration_seconds: number | null;
}

const AdminDashboard = () => {
  const { user: currentUser, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showClearStorageDialog, setShowClearStorageDialog] = useState(false);
  const [clearingStorage, setClearingStorage] = useState(false);

  // Fetch admin notifications (AI credit warnings)
  const { data: notifications = [] } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_notifications")
        .select("*")
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (error) {
        console.error("Error fetching notifications:", error);
        return [];
      }
      return data || [];
    },
    enabled: userRole === 'admin' || userRole === 'super_admin',
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch user presence data
  const { data: presenceData = [] } = useQuery({
    queryKey: ["user-presence"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_presence")
        .select("*");
      
      if (error) {
        console.error("Error fetching presence:", error);
        return [];
      }
      return data as UserPresence[];
    },
    enabled: userRole === 'admin' || userRole === 'super_admin',
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Create a map of user presence for quick lookup
  const presenceMap = new Map(presenceData.map(p => [p.user_id, p]));

  // Format session duration
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const dismissNotification = async (notificationId: string) => {
    await supabase
      .from("admin_notifications")
      .update({ read: true })
      .eq("id", notificationId);
    
    queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
  };

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
          approved_by: currentUser?.id,
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
    if (currentUser?.id === targetUserId) {
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

  const clearAllStorage = async () => {
    setClearingStorage(true);
    try {
      const { data, error } = await supabase.functions.invoke('clear-storage');

      if (error) throw error;

      toast({
        title: "Storage Cleared",
        description: `Successfully deleted ${data.totalDeleted} files from storage buckets`,
      });

      setShowClearStorageDialog(false);
    } catch (error) {
      console.error("Error clearing storage:", error);
      toast({
        title: "Error",
        description: "Failed to clear storage. Please try again.",
        variant: "destructive",
      });
    } finally {
      setClearingStorage(false);
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
      <div className="container py-8 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Manage user accounts and approve pending registrations
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Compact Notification Bell */}
              {(userRole === 'admin' || userRole === 'super_admin') && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="relative">
                      <Bell className="h-4 w-4" />
                      {notifications.length > 0 && (
                        <Badge 
                          variant="destructive" 
                          className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                        >
                          {notifications.length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-0">
                    <div className="p-3 border-b">
                      <h4 className="font-semibold text-sm">Notifications</h4>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No new notifications
                      </div>
                    ) : (
                      <ScrollArea className="max-h-64">
                        <div className="divide-y">
                          {notifications.map((notification: { id: string; type: string; message: string; created_at: string }) => (
                            <div key={notification.id} className="p-3 hover:bg-muted/50 relative group">
                              <div className="pr-6">
                                <p className="text-sm font-medium text-destructive">AI Service Alert</p>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {notification.message}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {format(new Date(notification.created_at), 'MMM d, h:mm a')}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="absolute top-2 right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => dismissNotification(notification.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </PopoverContent>
                </Popover>
              )}
              
              {userRole === 'super_admin' && (
                <Button
                  variant="destructive"
                  onClick={() => setShowClearStorageDialog(true)}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear All Storage
                </Button>
              )}
            </div>
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
                          <TableHead>Online</TableHead>
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
                                  disabled={user.id === currentUser?.id}
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
                            <TableCell>
                              {(() => {
                                const presence = presenceMap.get(user.id);
                                const isOnline = presence?.is_online;
                                const lastSeen = presence?.last_seen_at;
                                const lastDuration = presence?.last_session_duration_seconds;
                                
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-2">
                                          <Circle 
                                            className={`h-2.5 w-2.5 ${isOnline ? 'fill-green-500 text-green-500' : 'fill-muted text-muted'}`} 
                                          />
                                          <span className="text-xs text-muted-foreground">
                                            {isOnline ? 'Online' : lastSeen ? formatDistanceToNow(new Date(lastSeen), { addSuffix: true }) : 'Never'}
                                          </span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <div className="text-xs space-y-1">
                                          <p>
                                            <strong>Status:</strong> {isOnline ? 'Online now' : 'Offline'}
                                          </p>
                                          {lastSeen && (
                                            <p>
                                              <strong>Last seen:</strong> {format(new Date(lastSeen), 'MMM d, h:mm a')}
                                            </p>
                                          )}
                                          {lastDuration !== null && lastDuration !== undefined && (
                                            <p>
                                              <strong>Last session:</strong> {formatDuration(lastDuration)}
                                            </p>
                                          )}
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}
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

        <AlertDialog open={showClearStorageDialog} onOpenChange={setShowClearStorageDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear All Storage?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete ALL files from storage buckets:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>audit-pdfs</li>
                  <li>mobile-zips</li>
                  <li>interview-photos</li>
                  <li>interview-audio</li>
                </ul>
                <p className="mt-3 font-semibold text-destructive">This action cannot be undone!</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={clearingStorage}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={clearAllStorage} 
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={clearingStorage}
              >
                {clearingStorage ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  'Clear All Storage'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default AdminDashboard;
