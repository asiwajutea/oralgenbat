import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  cta_text: string | null;
  cta_url: string | null;
  created_by: string;
  created_at: string;
  scheduled_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  display_frequency: "once" | "every_login" | "daily" | "weekly";
  require_acknowledgment: boolean;
  target_type: "all" | "contractor" | "role" | "user";
  target_contractor_id: string | null;
  target_role: string | null;
  target_user_ids: string[] | null;
  priority: number;
  style: "info" | "warning" | "success" | "announcement";
}

export interface AnnouncementDismissal {
  id: string;
  announcement_id: string;
  user_id: string;
  dismissed_at: string;
  acknowledged: boolean;
}

export const useAnnouncements = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch active announcements targeted to user
  const { data: announcements = [], isLoading: announcementsLoading } = useQuery({
    queryKey: ["announcements", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("is_active", true)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Announcement[];
    },
    enabled: !!user?.id,
  });

  // Fetch user's dismissals
  const { data: dismissals = [], isLoading: dismissalsLoading } = useQuery({
    queryKey: ["announcement-dismissals", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("announcement_dismissals")
        .select("*")
        .eq("user_id", user.id);

      if (error) throw error;
      return data as AnnouncementDismissal[];
    },
    enabled: !!user?.id,
  });

  // Dismiss an announcement
  const dismissAnnouncement = useMutation({
    mutationFn: async ({ 
      announcementId, 
      acknowledged = false 
    }: { 
      announcementId: string; 
      acknowledged?: boolean;
    }) => {
      if (!user?.id) throw new Error("No user");

      // Check if dismissal already exists
      const { data: existing } = await supabase
        .from("announcement_dismissals")
        .select("id")
        .eq("announcement_id", announcementId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from("announcement_dismissals")
          .update({ 
            dismissed_at: new Date().toISOString(),
            acknowledged 
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("announcement_dismissals")
          .insert({
            announcement_id: announcementId,
            user_id: user.id,
            acknowledged,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcement-dismissals"] });
    },
  });

  // Create an announcement
  const createAnnouncement = useMutation({
    mutationFn: async (data: {
      title: string;
      content: string;
      cta_text?: string | null;
      cta_url?: string | null;
      style: string;
      display_frequency: string;
      require_acknowledgment: boolean;
      target_type: string;
      target_contractor_id?: string | null;
      target_role?: string | null;
      target_user_ids?: string[] | null;
      priority: number;
      scheduled_at?: string | null;
      expires_at?: string | null;
      is_active: boolean;
    }) => {
      if (!user?.id) throw new Error("No user");

      const { error } = await supabase
        .from("announcements")
        .insert({
          title: data.title,
          content: data.content,
          cta_text: data.cta_text,
          cta_url: data.cta_url,
          style: data.style,
          display_frequency: data.display_frequency,
          require_acknowledgment: data.require_acknowledgment,
          target_type: data.target_type,
          target_contractor_id: data.target_contractor_id,
          target_role: data.target_role as any,
          target_user_ids: data.target_user_ids,
          priority: data.priority,
          scheduled_at: data.scheduled_at,
          expires_at: data.expires_at,
          is_active: data.is_active,
          created_by: user.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  // Delete an announcement
  const deleteAnnouncement = useMutation({
    mutationFn: async (announcementId: string) => {
      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", announcementId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  // Update an announcement
  const updateAnnouncement = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, any>) => {
      // Remove created_by and created_at from updates
      const { created_by, created_at, ...updateData } = data;
      
      const { error } = await supabase
        .from("announcements")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  // Check if announcement should be shown based on frequency
  const shouldShowAnnouncement = (announcement: Announcement): boolean => {
    const dismissal = dismissals.find(d => d.announcement_id === announcement.id);
    
    if (!dismissal) return true;

    // If acknowledgment is required and was acknowledged, don't show again for "once"
    if (announcement.require_acknowledgment && dismissal.acknowledged && announcement.display_frequency === "once") {
      return false;
    }

    const dismissedAt = new Date(dismissal.dismissed_at);
    const now = new Date();

    switch (announcement.display_frequency) {
      case "once":
        return false;
      case "every_login":
        // Show on every session - handled by provider
        return false;
      case "daily":
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return dismissedAt < oneDayAgo;
      case "weekly":
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return dismissedAt < oneWeekAgo;
      default:
        return false;
    }
  };

  // Get pending announcements (not yet dismissed or need to be shown again)
  const pendingAnnouncements = announcements.filter(shouldShowAnnouncement);

  return {
    announcements,
    dismissals,
    pendingAnnouncements,
    announcementsLoading,
    dismissalsLoading,
    dismissAnnouncement: dismissAnnouncement.mutate,
    createAnnouncement: createAnnouncement.mutateAsync,
    deleteAnnouncement: deleteAnnouncement.mutate,
    updateAnnouncement: updateAnnouncement.mutate,
    shouldShowAnnouncement,
  };
};

// Fetch all announcements for notice board (including creator info)
export const useAllAnnouncements = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["all-announcements", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Announcement[];
    },
    enabled: !!user?.id,
  });
};
