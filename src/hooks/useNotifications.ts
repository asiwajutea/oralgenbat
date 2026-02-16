import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationSettings {
  id: string;
  user_id: string;
  push_subscription: any;
  notify_inactivity: boolean;
  notify_new_interviews: boolean;
  notify_re_audit: boolean;
  notify_failed_audit: boolean;
  notify_milestones: boolean;
  notify_audit_passed: boolean;
  notify_team_requests: boolean;
  notify_interview_assigned: boolean;
  notify_data_entry_complete: boolean;
  notify_account_status: boolean;
  notify_new_registration: boolean;
  notify_payment: boolean;
  notify_agent_reassigned: boolean;
  notify_issues: boolean;
  notify_comments: boolean;
}

// Maps notification type to the corresponding settings key
function getSettingsKeyForType(type: string): keyof NotificationSettings | null {
  const map: Record<string, keyof NotificationSettings> = {
    new_interview: "notify_new_interviews",
    failed_audit: "notify_failed_audit",
    re_audit: "notify_re_audit",
    milestone: "notify_milestones",
    inactivity: "notify_inactivity",
    audit_passed: "notify_audit_passed",
    team_request_approved: "notify_team_requests",
    team_request_rejected: "notify_team_requests",
    new_team_request: "notify_team_requests",
    interview_assigned: "notify_interview_assigned",
    data_entry_complete: "notify_data_entry_complete",
    account_approved: "notify_account_status",
    account_suspended: "notify_account_status",
    new_registration: "notify_new_registration",
    payment_created: "notify_payment",
    journey_updated: "notify_payment",
    agent_reassigned: "notify_agent_reassigned",
    issue_flagged: "notify_issues",
    issue_resolved: "notify_issues",
    comment_reply: "notify_comments",
    resolution_comment: "notify_comments",
    announcement: "notify_new_interviews", // announcements always show
  };
  return map[type] || null;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>("default");
  const settingsRef = useRef<NotificationSettings | null>(null);

  // Check notification permission status
  useEffect(() => {
    if ("Notification" in window) {
      setPermissionStatus(Notification.permission);
    }
  }, []);

  // Fetch notifications
  const { data: notifications = [], isLoading: notificationsLoading } = useQuery({
    queryKey: ["user-notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("user_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!user?.id,
  });

  // Fetch notification settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["notification-settings", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from("user_notification_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as NotificationSettings | null;
    },
    enabled: !!user?.id,
  });

  // Keep ref in sync for realtime callback
  useEffect(() => {
    settingsRef.current = settings ?? null;
  }, [settings]);

  // Realtime subscription for push notifications
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;

          // Invalidate query cache so bell icon updates
          queryClient.invalidateQueries({ queryKey: ["user-notifications"] });

          // Check if push is allowed for this type
          const settingsKey = getSettingsKeyForType(newNotification.type);
          const currentSettings = settingsRef.current;
          const isEnabled = settingsKey
            ? (currentSettings?.[settingsKey] ?? true)
            : true;

          // Fire browser notification if permitted
          if (
            isEnabled &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            try {
              new window.Notification(newNotification.title, {
                body: newNotification.message,
                icon: "/pwa-192x192.png",
                tag: newNotification.id,
              });
            } catch (err) {
              console.error("Failed to show notification:", err);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Count unread notifications
  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Mark notification as read
  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("user_notifications")
        .update({ is_read: true })
        .eq("id", notificationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-notifications"] });
    },
  });

  // Mark all as read
  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      
      const { error } = await supabase
        .from("user_notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-notifications"] });
    },
  });

  // Update notification settings
  const updateSettings = useMutation({
    mutationFn: async (newSettings: Partial<NotificationSettings>) => {
      if (!user?.id) throw new Error("No user");
      
      const { error } = await supabase
        .from("user_notification_settings")
        .upsert({
          user_id: user.id,
          ...newSettings,
        }, { onConflict: "user_id" });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-settings"] });
    },
  });

  // Request push notification permission
  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      console.log("This browser does not support notifications");
      return false;
    }

    const permission = await Notification.requestPermission();
    setPermissionStatus(permission);
    
    if (permission === "granted") {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await (registration as any).pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
          });
          
          await updateSettings.mutateAsync({
            push_subscription: subscription.toJSON(),
          });
          
          return true;
        } catch (err) {
          console.error("Failed to subscribe to push notifications:", err);
          return false;
        }
      }
    }
    
    return permission === "granted";
  }, [updateSettings]);

  // Show local notification
  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (permissionStatus === "granted") {
      new Notification(title, options);
    }
  }, [permissionStatus]);

  return {
    notifications,
    unreadCount,
    settings,
    permissionStatus,
    notificationsLoading,
    settingsLoading,
    markAsRead: markAsRead.mutate,
    markAllAsRead: markAllAsRead.mutate,
    updateSettings: updateSettings.mutate,
    requestPermission,
    showNotification,
  };
};
