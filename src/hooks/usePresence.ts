import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const usePresence = () => {
  const { user } = useAuth();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartRef = useRef<Date | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const updatePresence = async (isOnline: boolean) => {
      try {
        const now = new Date().toISOString();
        
        if (isOnline && !sessionStartRef.current) {
          sessionStartRef.current = new Date();
        }

        const updateData: Record<string, unknown> = {
          is_online: isOnline,
          last_seen_at: now,
          updated_at: now,
        };

        if (isOnline && sessionStartRef.current) {
          updateData.session_started_at = sessionStartRef.current.toISOString();
        }

        if (!isOnline && sessionStartRef.current) {
          const durationSeconds = Math.floor(
            (Date.now() - sessionStartRef.current.getTime()) / 1000
          );
          updateData.last_session_duration_seconds = durationSeconds;
          sessionStartRef.current = null;
        }

        // Upsert presence record
        const { error } = await supabase
          .from("user_presence")
          .upsert({
            user_id: user.id,
            ...updateData,
          }, {
            onConflict: 'user_id',
          });

        if (error) {
          console.error("Error updating presence:", error);
        }
      } catch (err) {
        console.error("Presence update failed:", err);
      }
    };

    // Set online when mounting
    updatePresence(true);

    // Heartbeat every 30 seconds
    heartbeatRef.current = setInterval(() => {
      updatePresence(true);
    }, 30000);

    // Handle visibility change (tab hidden/visible)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        updatePresence(false);
      } else {
        updatePresence(true);
      }
    };

    // Handle before unload (closing tab/window)
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable delivery
      const payload = JSON.stringify({
        user_id: user.id,
        is_online: false,
        last_seen_at: new Date().toISOString(),
        last_session_duration_seconds: sessionStartRef.current
          ? Math.floor((Date.now() - sessionStartRef.current.getTime()) / 1000)
          : 0,
      });

      // Can't use supabase client in unload, so just mark offline
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_presence?user_id=eq.${user.id}`,
        payload
      );
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      // Cleanup
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      
      // Mark offline on unmount
      updatePresence(false);
    };
  }, [user?.id]);
};

// Hook for admins to fetch user presence data
export const useUserPresenceData = () => {
  const { userRole } = useAuth();
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';

  return {
    isAdmin,
    fetchPresence: async () => {
      if (!isAdmin) return [];
      
      const { data, error } = await supabase
        .from("user_presence")
        .select("*")
        .order("last_seen_at", { ascending: false });

      if (error) {
        console.error("Error fetching presence:", error);
        return [];
      }

      return data || [];
    },
  };
};