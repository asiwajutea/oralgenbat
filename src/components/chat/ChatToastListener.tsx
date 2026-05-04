import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Listens for new chat messages and shows a toast when the user is NOT on /inbox.
 * Mounted once at the app root inside AuthProvider.
 */
export const ChatToastListener = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const conversationsRef = useRef<Set<string>>(new Set());
  const enabledRef = useRef<boolean>(true);
  const pathRef = useRef(location.pathname);

  useEffect(() => { pathRef.current = location.pathname; }, [location.pathname]);

  // Load my conversation ids + push_enabled preference
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      const [{ data: parts }, { data: prefs }] = await Promise.all([
        supabase
          .from("chat_participants")
          .select("conversation_id")
          .eq("user_id", user.id)
          .is("removed_at", null),
        supabase
          .from("chat_user_preferences")
          .select("push_enabled")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      conversationsRef.current = new Set((parts || []).map((p: any) => p.conversation_id));
      enabledRef.current = prefs?.push_enabled !== false;
    })();

    // Subscribe to participant changes so the set stays current
    const partCh = supabase
      .channel(`toast-parts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_participants", filter: `user_id=eq.${user.id}` },
        async () => {
          const { data } = await supabase
            .from("chat_participants")
            .select("conversation_id")
            .eq("user_id", user.id)
            .is("removed_at", null);
          conversationsRef.current = new Set((data || []).map((p: any) => p.conversation_id));
        }
      )
      .subscribe();

    // Subscribe to message inserts
    const msgCh = supabase
      .channel(`toast-msgs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        async (payload: any) => {
          if (!enabledRef.current) return;
          if (pathRef.current.startsWith("/inbox")) return;
          const m = payload.new as { id: string; conversation_id: string; sender_id: string | null; body: string | null; metadata: any };
          if (!m?.conversation_id) return;
          if (m.sender_id && m.sender_id === user.id) return;
          if (!conversationsRef.current.has(m.conversation_id)) return;

          // Look up sender name + conversation title
          const [{ data: sender }, { data: conv }] = await Promise.all([
            m.sender_id
              ? supabase.from("profiles").select("full_name").eq("id", m.sender_id).maybeSingle()
              : Promise.resolve({ data: null } as any),
            supabase.from("chat_conversations").select("title, category").eq("id", m.conversation_id).maybeSingle(),
          ]);
          const senderName = sender?.full_name || (m.sender_id ? "Someone" : "System");
          const title = conv?.title ? `${senderName} · ${conv.title}` : senderName;
          const body = (m.body || "").trim() || "(attachment)";

          toast(title, {
            description: body.length > 120 ? body.slice(0, 120) + "…" : body,
            action: {
              label: "Open",
              onClick: () => navigate(`/inbox?conv=${m.conversation_id}`),
            },
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(partCh);
      supabase.removeChannel(msgCh);
    };
  }, [user?.id, navigate]);

  return null;
};

export default ChatToastListener;