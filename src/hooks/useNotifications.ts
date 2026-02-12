import { useState, useEffect, useCallback } from "react";
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
}

export const useNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>("default");

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
      // Subscribe to push notifications if service worker is available
      if ("serviceWorker" in navigator && "PushManager" in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          // VAPID key would be configured here for production push notifications
          const subscription = await (registration as any).pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
          });
          
          // Save subscription to database
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

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
