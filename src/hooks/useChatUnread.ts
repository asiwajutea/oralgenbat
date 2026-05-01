import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useChatUnreadTotal() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["chat-unread-total", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_chat_unread_total");
      if (error) throw error;
      return Number(data || 0);
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`chat-unread-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_participants", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["chat-unread-total", user.id] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  return query;
}

export function useChatUnreadByCategory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["chat-unread-summary", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_chat_unread_summary");
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((row: any) => { map[row.category] = Number(row.unread_count); });
      return map;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}