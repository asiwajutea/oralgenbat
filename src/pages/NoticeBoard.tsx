import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Megaphone, Search, Bell, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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

const NoticeBoard = () => {
  const navigate = useNavigate();
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
  const [pushTargetRole, setPushTargetRole] = useState("");
  const [pushSending, setPushSending] = useState(false);

  const defaultTab = searchParams.get("tab") === "push" ? "push" : "all";

  // Check if user can create announcements
  const canCreate = userRole && 
    ["super_admin", "contractor", "sub_contractor", "quality_assurance_manager"].includes(userRole);

  // Filter announcements
  const filteredAnnouncements = allAnnouncements.filter(a =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const myAnnouncements = filteredAnnouncements.filter(a => a.created_by === user?.id);
  const allPublic = filteredAnnouncements;

  const handleDelete = (id: string) => {
    deleteAnnouncement(id);
    setDeletingId(null);
    toast.success("Announcement deleted");
  };

  const handleViewClose = (acknowledged: boolean) => {
    if (viewingAnnouncement) {
      dismissAnnouncement({ 
        announcementId: viewingAnnouncement.id, 
        acknowledged 
      });
      setViewingAnnouncement(null);
    }
  };

  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushMessage.trim() || !user?.id) {
      toast.error("Please fill in the title and message");
      return;
    }

    setPushSending(true);
    try {
      const announcementData: any = {
        title: pushTitle.trim(),
        content: pushMessage.trim(),
        created_by: user.id,
        display_frequency: "once",
        is_active: true,
        style: "info",
        target_type: pushTargetType,
      };

      if (pushTargetType === "role" && pushTargetRole) {
        announcementData.target_role = pushTargetRole;
      }

      const { error } = await supabase.from("announcements").insert(announcementData);

      if (error) throw error;

      toast.success("Push notification sent successfully!");
      setPushTitle("");
      setPushMessage("");
      setPushTargetType("all");
      setPushTargetRole("");
    } catch (error: any) {
      toast.error("Failed to send push notification: " + error.message);
    } finally {
      setPushSending(false);
    }
  };

  const permissionStatus = typeof window !== "undefined" && "Notification" in window 
    ? Notification.permission 
    : "unsupported";

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
            <p className="text-muted-foreground">
              View and manage announcements
            </p>
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
        <Input
          placeholder="Search announcements..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="all">All Announcements</TabsTrigger>
          {canCreate && (
            <TabsTrigger value="mine">My Announcements</TabsTrigger>
          )}
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
            ) : allPublic.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Megaphone className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No announcements yet</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? "Try a different search term" : "Check back later for updates"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {allPublic.map((announcement) => (
                  <AnnouncementCard
                    key={announcement.id}
                    announcement={announcement}
                    isCreator={announcement.created_by === user?.id}
                    onEdit={() => {
                      setEditingAnnouncement(announcement);
                      setCreateDialogOpen(true);
                    }}
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
                  <p className="text-muted-foreground mb-4">
                    Create your first announcement to get started
                  </p>
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Announcement
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {myAnnouncements.map((announcement) => (
                    <AnnouncementCard
                      key={announcement.id}
                      announcement={announcement}
                      isCreator={true}
                      onEdit={() => {
                        setEditingAnnouncement(announcement);
                        setCreateDialogOpen(true);
                      }}
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
            {/* Permission Status */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Your Notification Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {permissionStatus === "granted" ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                    Push notifications enabled
                  </Badge>
                ) : permissionStatus === "denied" ? (
                  <div className="space-y-2">
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800">
                      Push notifications blocked
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      Re-enable in your browser settings: click the lock icon in the address bar → Site settings → Notifications → Allow
                    </p>
                  </div>
                ) : permissionStatus === "default" ? (
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">Not yet enabled</Badge>
                    <Button size="sm" onClick={() => {
                      if ("Notification" in window) Notification.requestPermission();
                    }}>
                      Enable
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline">Not supported in this browser</Badge>
                )}
              </CardContent>
            </Card>

            {/* Send Push Notification Form */}
            {canCreate && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    Send Push Notification
                  </CardTitle>
                  <CardDescription>
                    Send a push notification to targeted users. This creates an announcement that triggers browser notifications.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="push-title">Title</Label>
                    <Input
                      id="push-title"
                      placeholder="Notification title..."
                      value={pushTitle}
                      onChange={(e) => setPushTitle(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="push-message">Message</Label>
                    <Textarea
                      id="push-message"
                      placeholder="Type your notification message..."
                      value={pushMessage}
                      onChange={(e) => setPushMessage(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Target Audience</Label>
                      <Select value={pushTargetType} onValueChange={setPushTargetType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Users</SelectItem>
                          <SelectItem value="role">Specific Role</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {pushTargetType === "role" && (
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={pushTargetRole} onValueChange={setPushTargetRole}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="field_manager">Field Manager</SelectItem>
                            <SelectItem value="auditor">Auditor</SelectItem>
                            <SelectItem value="contractor">Contractor</SelectItem>
                            <SelectItem value="sub_contractor">Sub Contractor</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                            <SelectItem value="data_entry_clerk">Data Entry Clerk</SelectItem>
                            <SelectItem value="quality_assurance_manager">QA Manager</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <Button 
                    onClick={handleSendPush} 
                    disabled={pushSending || !pushTitle.trim() || !pushMessage.trim()}
                    className="w-full sm:w-auto"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {pushSending ? "Sending..." : "Send Notification"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {!canCreate && (
              <Card>
                <CardContent className="py-8 text-center">
                  <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium">Push Notifications</h3>
                  <p className="text-muted-foreground mt-2">
                    You'll receive push notifications here when they're sent by your team leads.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <CreateAnnouncementDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) setEditingAnnouncement(null);
        }}
        editingAnnouncement={editingAnnouncement}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this announcement? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && handleDelete(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Announcement Modal */}
      {viewingAnnouncement && (
        <AnnouncementModal
          announcement={viewingAnnouncement}
          onDismiss={handleViewClose}
        />
      )}
    </div>
  );
};

export default NoticeBoard;
