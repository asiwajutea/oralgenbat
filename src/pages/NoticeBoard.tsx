import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Megaphone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAllAnnouncements, useAnnouncements, Announcement } from "@/hooks/useAnnouncements";
import { useAuth } from "@/contexts/AuthContext";
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
  const { user, userRole } = useAuth();
  const { data: allAnnouncements = [], isLoading } = useAllAnnouncements();
  const { deleteAnnouncement, dismissAnnouncement } = useAnnouncements();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingAnnouncement, setViewingAnnouncement] = useState<Announcement | null>(null);

  // Check if user can create announcements
  const canCreate = userRole && 
    ["super_admin", "contractor", "sub_contractor", "quality_assurance_manager"].includes(userRole);

  // Filter announcements
  const filteredAnnouncements = allAnnouncements.filter(a =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate my announcements vs all
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
            New Announcement
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
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="all">All Announcements</TabsTrigger>
          {canCreate && (
            <TabsTrigger value="mine">My Announcements</TabsTrigger>
          )}
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
