import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ParticipantInfo = {
  user_id: string;
  full_name: string | null;
  role: string | null;
};

export function useConversationParticipants(conversationIds: string[]) {
  const key = conversationIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["chat-conv-participants", key],
    queryFn: async () => {
      if (conversationIds.length === 0) return {} as Record<string, ParticipantInfo[]>;
      const { data: parts } = await supabase
        .from("chat_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", conversationIds)
        .is("removed_at", null);
      const userIds = Array.from(new Set((parts || []).map((p) => p.user_id)));
      const [profilesRes, rolesRes] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? supabase.from("user_roles").select("user_id, role").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const nameById: Record<string, string> = {};
      (profilesRes.data || []).forEach((p: any) => { nameById[p.id] = p.full_name; });
      const roleById: Record<string, string> = {};
      (rolesRes.data || []).forEach((r: any) => {
        // prefer first role found; fine for display
        if (!roleById[r.user_id]) roleById[r.user_id] = r.role;
      });
      const map: Record<string, ParticipantInfo[]> = {};
      (parts || []).forEach((p) => {
        if (!map[p.conversation_id]) map[p.conversation_id] = [];
        map[p.conversation_id].push({
          user_id: p.user_id,
          full_name: nameById[p.user_id] || null,
          role: roleById[p.user_id] || null,
        });
      });
      return map;
    },
    enabled: conversationIds.length > 0,
    staleTime: 60_000,
  });
}

export function formatRole(role: string | null | undefined) {
  if (!role) return "";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function describeOthers(parts: ParticipantInfo[] | undefined, currentUserId: string | undefined): string {
  if (!parts || !currentUserId) return "";
  const others = parts.filter((p) => p.user_id !== currentUserId);
  if (others.length === 0) return "Just you";
  if (others.length === 1) {
    const o = others[0];
    return `${o.full_name || "Unknown"}${o.role ? ` · ${formatRole(o.role)}` : ""}`;
  }
  if (others.length <= 3) {
    return others.map((o) => o.full_name || "Unknown").join(", ");
  }
  return `${others.slice(0, 2).map((o) => o.full_name || "Unknown").join(", ")} +${others.length - 2}`;
}