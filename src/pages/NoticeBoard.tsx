import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Megaphone, Search, Bell, Send, Users, Eye, MousePointerClick, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAllAnnouncements, useAnnouncements, Announcement } from "@/hooks/useAnnouncements";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AnnouncementCard } from "@/components/announcements/AnnouncementCard";
import { CreateAnnouncementDialog } from "@/components/announcements/CreateAnnouncementDialog";
import { AnnouncementModal } from "@/components/announcements/AnnouncementModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "auditor", label: "Auditor" },
  { value: "contractor", label: "Contractor" },
  { value: "sub_contractor", label: "Sub-Contractor" },
  { value: "field_manager", label: "Field Manager" },
  { value: "data_entry_clerk", label: "Data Entry Clerk" },
  { value: "quality_assurance_manager", label: "QA Manager" },
];

const NoticeBoard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { user, userRole } = useAuth();
  const { data: allAnnouncements = [], isLoading } = useAllAnnouncements();
  const { deleteAnnouncement, dismissAnnouncement } = useAnnouncements();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingAnnouncement, setViewingAnnouncement] = useState<Announcement | null>(null);

  // Push notification form state
  const [pushTitle, setPushTitle] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushTargetType, setPushTargetType] = useState("all");
  const [pushTargetRoles, setPushTargetRoles] = useState<string[]>([]);
  const [pushTargetUserIds, setPushTargetUserIds] = useState<string[]>([]);
  const [pushUserSearch, setPushUserSearch] = useState("");
  const [pushSending, setPushSending] = useState(false);

  const defaultTab = searchParams.get("tab") === "push" ? "push" : "all";

  const canCreate = userRole && 
    ["super_admin", "contractor", "sub_contractor", "quality_assurance_manager"].includes(userRole);

  // Fetch push subscription stats with subscriber details
  const { data: pushDashboardData } = useQuery({
    queryKey: ["push-dashboard-stats"],
    queryFn: async () => {
      // Get all notification settings with push subscriptions
      const { data: allSettings } = await supabase
        .from("user_notification_settings")
        .select("user_id, push_subscription, updated_at");
      
      const { count: totalUsers } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("is_approved", true);

      const subscribedSettings = (allSettings || []).filter(s => s.push_subscription !== null);
      const subscribedUserIds = subscribedSettings.map(s => s.user_id);

      // Get subscriber profiles
      let subscribers: { id: string; full_name: string; email: string; subscribed_at: string }[] = [];
      if (subscribedUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", subscribedUserIds);
        
        const settingsMap = new Map(subscribedSettings.map(s => [s.user_id, s.updated_at]));
        subscribers = (profiles || []).map(p => ({
          ...p,
          subscribed_at: settingsMap.get(p.id) || "",
        }));
      }

      // Get aggregate delivery stats
      const { data: allDeliveries } = await supabase
        .from("push_notification_deliveries")
        .select("id, read_at, interacted_at");

      const totalDelivered = allDeliveries?.length || 0;
      const totalRead = allDeliveries?.filter(d => d.read_at).length || 0;
      const totalInteracted = allDeliveries?.filter(d => d.interacted_at).length || 0;

      // Total sent notifications
      const { count: totalSent } = await supabase
        .from("push_notifications")
        .select("id", { count: "exact", head: true });

      return {
        totalUsers: totalUsers || 0,
        subscribedCount: subscribedSettings.length,
        totalSent: totalSent || 0,
        totalDelivered,
        totalRead,
        totalInteracted,
        subscribers,
      };
    },
    enabled: !!canCreate,
  });

  // Fetch sent push notifications with delivery stats
  const { data: sentPushNotifications = [], isLoading: pushLoading } = useQuery({
    queryKey: ["sent-push-notifications"],
    queryFn: async () => {
      const { data: pushNotifs } = await supabase
        .from("push_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!pushNotifs || pushNotifs.length === 0) return [];

      // Get delivery stats for each
      const pushIds = pushNotifs.map(p => p.id);
      const { data: deliveries } = await supabase
        .from("push_notification_deliveries")
        .select("push_notification_id, read_at, interacted_at")
        .in("push_notification_id", pushIds);

      const statsMap = new Map<string, { delivered: number; read: number; interacted: number }>();
      (deliveries || []).forEach(d => {
        const existing = statsMap.get(d.push_notification_id) || { delivered: 0, read: 0, interacted: 0 };
        existing.delivered++;
        if (d.read_at) existing.read++;
        if (d.interacted_at) existing.interacted++;
        statsMap.set(d.push_notification_id, existing);
      });

      // Get creator names
      const creatorIds = [...new Set(pushNotifs.map(p => p.created_by))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", creatorIds);
      const nameMap = new Map((profiles || []).map(p => [p.id, p.full_name]));

      return pushNotifs.map(p => ({
        ...p,
        creator_name: nameMap.get(p.created_by) || "Unknown",
        stats: statsMap.get(p.id) || { delivered: 0, read: 0, interacted: 0 },
      }));
    },
    enabled: !!canCreate,
  });

  // Fetch users for specific user targeting
  const { data: allUsers = [] } = useQuery({
    queryKey: ["all-approved-users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, contractor_id")
        .eq("is_approved", true)
        .order("full_name");
      return data || [];
    },
    enabled: !!canCreate && pushTargetType === "users",
  });

  const filteredUsers = allUsers.filter(u =>
    u.full_name?.toLowerCase().includes(pushUserSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(pushUserSearch.toLowerCase())
  );

  const filteredAnnouncements = allAnnouncements.filter(a =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const myAnnouncements = filteredAnnouncements.filter(a => a.created_by === user?.id);

  const handleDelete = (id: string) => {
    deleteAnnouncement(id);
    setDeletingId(null);
    toast.success("Announcement deleted");
  };

  const handleViewClose = (acknowledged: boolean) => {
    if (viewingAnnouncement) {
      dismissAnnouncement({ announcementId: viewingAnnouncement.id, acknowledged });
      setViewingAnnouncement(null);
    }
  };

  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushMessage.trim() || !user?.id) {
      toast.error("Please fill in the title and message");
      return;
    }

    if (pushTargetType === "roles" && pushTargetRoles.length === 0) {
      toast.error("Please select at least one role");
      return;
    }

    if (pushTargetType === "users" && pushTargetUserIds.length === 0) {
      toast.error("Please select at least one user");
      return;
    }

    setPushSending(true);
    try {
      const pushData: any = {
        title: pushTitle.trim(),
        message: pushMessage.trim(),
        created_by: user.id,
        target_type: pushTargetType,
        target_roles: pushTargetType === "roles" ? pushTargetRoles : null,
        target_user_ids: pushTargetType === "users" ? pushTargetUserIds : null,
      };

      const { error } = await supabase.from("push_notifications").insert(pushData);
      if (error) throw error;

      toast.success("Push notification sent successfully!");
      setPushTitle("");
      setPushMessage("");
      setPushTargetType("all");
      setPushTargetRoles([]);
      setPushTargetUserIds([]);
      queryClient.invalidateQueries({ queryKey: ["sent-push-notifications"] });
    } catch (error: any) {
      toast.error("Failed to send: " + error.message);
    } finally {
      setPushSending(false);
    }
  };

  const permissionStatus = typeof window !== "undefined" && "Notification" in window 
    ? Notification.permission 
    : "unsupported";

  const togglePushRole = (role: string) => {
    setPushTargetRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };

  const togglePushUser = (userId: string) => {
    setPushTargetUserIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Megaphone className="h-6 w-6" />
              Notice Board
            </h1>
            <p className="text-muted-foreground">View and manage announcements</p>
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">New Announcement</span>
            <span className="sm:hidden">New</span>
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search announcements..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="all">All Announcements</TabsTrigger>
          {canCreate && <TabsTrigger value="mine">My Announcements</TabsTrigger>}
          <TabsTrigger value="push" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Push Notifications
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <ScrollArea className="h-[calc(100vh-280px)]">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredAnnouncements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No announcements yet</h3>
                <p className="text-muted-foreground">{searchQuery ? "Try a different search term" : "Check back later for updates"}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAnnouncements.map((announcement) => (
                  <AnnouncementCard
                    key={announcement.id}
                    announcement={announcement}
                    isCreator={announcement.created_by === user?.id}
                    onEdit={() => { setEditingAnnouncement(announcement); setCreateDialogOpen(true); }}
                    onDelete={() => setDeletingId(announcement.id)}
                    onClick={() => setViewingAnnouncement(announcement)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {canCreate && (
          <TabsContent value="mine">
            <ScrollArea className="h-[calc(100vh-280px)]">
              {myAnnouncements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No announcements created</h3>
                  <p className="text-muted-foreground mb-4">Create your first announcement to get started</p>
                  <Button onClick={() => setCreateDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Create Announcement</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {myAnnouncements.map((announcement) => (
                    <AnnouncementCard
                      key={announcement.id}
                      announcement={announcement}
                      isCreator={true}
                      onEdit={() => { setEditingAnnouncement(announcement); setCreateDialogOpen(true); }}
                      onDelete={() => setDeletingId(announcement.id)}
                      onClick={() => setViewingAnnouncement(announcement)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        )}

        <TabsContent value="push">
          <div className="space-y-6">
            {/* Subscription Stats */}
            {canCreate && pushDashboardData && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Card>
                  <CardContent className="p-4 text-center">
                    <Users className="h-5 w-5 text-primary mx-auto mb-1" />
                    <p className="text-2xl font-bold">{pushDashboardData.totalUsers}</p>
                    <p className="text-xs text-muted-foreground">Total Users</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Bell className="h-5 w-5 text-green-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold">{pushDashboardData.subscribedCount}</p>
                    <p className="text-xs text-muted-foreground">Subscribed</p>
                    <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${pushDashboardData.totalUsers > 0 ? (pushDashboardData.subscribedCount / pushDashboardData.totalUsers) * 100 : 0}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Send className="h-5 w-5 text-primary mx-auto mb-1" />
                    <p className="text-2xl font-bold">{pushDashboardData.totalSent}</p>
                    <p className="text-xs text-muted-foreground">Total Sent</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Send className="h-5 w-5 text-blue-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold">{pushDashboardData.totalDelivered}</p>
                    <p className="text-xs text-muted-foreground">Delivered</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <Eye className="h-5 w-5 text-amber-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold">{pushDashboardData.totalRead}</p>
                    <p className="text-xs text-muted-foreground">Read</p>
                    {pushDashboardData.totalDelivered > 0 && (
                      <p className="text-xs text-green-600 font-medium">{Math.round((pushDashboardData.totalRead / pushDashboardData.totalDelivered) * 100)}%</p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <MousePointerClick className="h-5 w-5 text-purple-500 mx-auto mb-1" />
                    <p className="text-2xl font-bold">{pushDashboardData.totalInteracted}</p>
                    <p className="text-xs text-muted-foreground">Clicked</p>
                    {pushDashboardData.totalDelivered > 0 && (
                      <p className="text-xs text-green-600 font-medium">{Math.round((pushDashboardData.totalInteracted / pushDashboardData.totalDelivered) * 100)}%</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Subscribers Table */}
            {canCreate && pushDashboardData && pushDashboardData.subscribers.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Subscribed Users ({pushDashboardData.subscribers.length})</CardTitle>
                  <CardDescription>Users with active push notification subscriptions</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[200px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Subscribed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pushDashboardData.subscribers.map(sub => (
                          <TableRow key={sub.id}>
                            <TableCell className="font-medium text-sm">{sub.full_name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{sub.email}</TableCell>
                            <TableCell className="text-sm">{sub.subscribed_at ? format(new Date(sub.subscribed_at), "MMM d, yyyy") : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Your Status */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Your Notification Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {permissionStatus === "granted" ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">Push notifications enabled</Badge>
                    <Button size="sm" variant="outline" onClick={async () => {
                      if (!user?.id) return;
                      try {
                        await supabase.from("push_notifications").insert({
                          title: "🔔 Test Notification",
                          message: "This is a test push notification from the PWA Web Push system.",
                          created_by: user.id,
                          target_type: "users",
                          target_user_ids: [user.id],
                        });
                        toast.success("Test notification sent! You should receive it shortly.");
                      } catch {
                        toast.error("Failed to send test notification");
                      }
                    }}>
                      Test Push
                    </Button>
                  </div>
                ) : permissionStatus === "denied" ? (
                  <div className="space-y-2">
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">Push notifications blocked</Badge>
                    <p className="text-xs text-muted-foreground">Re-enable in browser settings: click lock icon → Site settings → Notifications → Allow</p>
                  </div>
                ) : permissionStatus === "default" ? (
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">Not yet enabled</Badge>
                    <Button size="sm" onClick={() => { if ("Notification" in window) Notification.requestPermission(); }}>Enable</Button>
                  </div>
                ) : (
                  <Badge variant="outline">Not supported</Badge>
                )}
              </CardContent>
            </Card>

            {/* Send Push Form */}
            {canCreate && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" />Send Push Notification</CardTitle>
                  <CardDescription>Send a push notification directly to users. This is separate from announcements.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input placeholder="Notification title..." value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea placeholder="Type your message..." value={pushMessage} onChange={(e) => setPushMessage(e.target.value)} rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Audience</Label>
                    <Select value={pushTargetType} onValueChange={(v) => { setPushTargetType(v); setPushTargetRoles([]); setPushTargetUserIds([]); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        <SelectItem value="roles">Specific Roles</SelectItem>
                        <SelectItem value="users">Specific Users</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {pushTargetType === "roles" && (
                    <div className="space-y-2">
                      <Label>Select Roles</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {ROLES.map(r => (
                          <label key={r.value} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-accent">
                            <Checkbox checked={pushTargetRoles.includes(r.value)} onCheckedChange={() => togglePushRole(r.value)} />
                            <span className="text-sm">{r.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {pushTargetType === "users" && (
                    <div className="space-y-2">
                      <Label>Select Users</Label>
                      <Input placeholder="Search users..." value={pushUserSearch} onChange={(e) => setPushUserSearch(e.target.value)} />
                      {pushTargetUserIds.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {pushTargetUserIds.map(id => {
                            const u = allUsers.find(u => u.id === id);
                            return (
                              <Badge key={id} variant="secondary" className="cursor-pointer" onClick={() => togglePushUser(id)}>
                                {u?.full_name || id} ×
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                      <ScrollArea className="h-[200px] border rounded-md">
                        <div className="p-2 space-y-1">
                          {filteredUsers.slice(0, 50).map(u => (
                            <label key={u.id} className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent">
                              <Checkbox checked={pushTargetUserIds.includes(u.id)} onCheckedChange={() => togglePushUser(u.id)} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{u.full_name}</p>
                                <p className="text-xs text-muted-foreground truncate">{u.email} · {u.contractor_id}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  <Button onClick={handleSendPush} disabled={pushSending || !pushTitle.trim() || !pushMessage.trim()} className="w-full sm:w-auto">
                    <Send className="h-4 w-4 mr-2" />
                    {pushSending ? "Sending..." : "Send Notification"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Sent Push Notifications History */}
            {canCreate && (
              <Card>
                <CardHeader>
                  <CardTitle>Sent Push Notifications</CardTitle>
                  <CardDescription>Track delivery and interaction with sent notifications</CardDescription>
                </CardHeader>
                <CardContent>
                  {pushLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                  ) : sentPushNotifications.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">No push notifications sent yet</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Title</TableHead>
                            <TableHead>Sent By</TableHead>
                            <TableHead>Target</TableHead>
                            <TableHead>Sent</TableHead>
                            <TableHead className="text-center">
                              <div className="flex items-center justify-center gap-1"><Send className="h-3 w-3" />Delivered</div>
                            </TableHead>
                            <TableHead className="text-center">
                              <div className="flex items-center justify-center gap-1"><Eye className="h-3 w-3" />Read</div>
                            </TableHead>
                            <TableHead className="text-center">
                              <div className="flex items-center justify-center gap-1"><MousePointerClick className="h-3 w-3" />Interacted</div>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sentPushNotifications.map(n => (
                            <TableRow key={n.id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium text-sm">{n.title}</p>
                                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">{n.message}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{n.creator_name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {n.target_type === "all" ? "All" : n.target_type === "roles" ? (n.target_roles || []).join(", ") : `${(n.target_user_ids || []).length} users`}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">{format(new Date(n.created_at), "MMM d, HH:mm")}</TableCell>
                              <TableCell className="text-center font-medium">{n.stats.delivered}</TableCell>
                              <TableCell className="text-center font-medium">{n.stats.read}</TableCell>
                              <TableCell className="text-center font-medium">{n.stats.interacted}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {!canCreate && (
              <Card>
                <CardContent className="py-8 text-center">
                  <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium">Push Notifications</h3>
                  <p className="text-muted-foreground mt-2">You'll receive push notifications here when sent by your team leads.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <CreateAnnouncementDialog
        open={createDialogOpen}
        onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) setEditingAnnouncement(null); }}
        editingAnnouncement={editingAnnouncement}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingId && handleDelete(deletingId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viewingAnnouncement && (
        <AnnouncementModal announcement={viewingAnnouncement} onDismiss={handleViewClose} />
      )}
    </div>
  );
};

export default NoticeBoard;
