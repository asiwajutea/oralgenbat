import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, Maximize2, Loader2 } from "lucide-react";
import { useFloatingChat } from "./FloatingChatProvider";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Props {
  conversationId: string;
  index: number;
}

export const MiniChatWindow = ({ conversationId, index }: Props) => {
  const { user } = useAuth();
  const { close } = useFloatingChat();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem(`mini-chat-pos-${conversationId}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { x: 24 + index * 340, y: 24 };
  });
  const draggingRef = useRef<{ dx: number; dy: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(`mini-chat-pos-${conversationId}`, JSON.stringify(pos));
  }, [pos, conversationId]);

  const { data: conv } = useQuery({
    queryKey: ["mini-conv", conversationId],
    queryFn: async () => {
      const { data } = await supabase.from("chat_conversations").select("id, title").eq("id", conversationId).maybeSingle();
      return data;
    },
  });

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["mini-messages", conversationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, sender_id, body, created_at, message_type")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(50);
      return data || [];
    },
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`mini-${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` }, () => {
        qc.invalidateQueries({ queryKey: ["mini-messages", conversationId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, user?.id, qc]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 320, e.clientX - draggingRef.current.dx)),
      y: Math.max(0, Math.min(window.innerHeight - 80, e.clientY - draggingRef.current.dy)),
    });
  };
  const onPointerUp = () => { draggingRef.current = null; };

  const handleSend = async () => {
    if (!body.trim()) return;
    setSending(true);
    const { error } = await supabase.from("chat_messages").insert({
      conversation_id: conversationId,
      sender_id: user!.id,
      body: body.trim(),
      message_type: "text",
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setBody("");
    qc.invalidateQueries({ queryKey: ["mini-messages", conversationId] });
  };

  return (
    <div
      className="fixed z-50 w-80 h-96 bg-background border rounded-lg shadow-lg flex flex-col"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b bg-muted/50 rounded-t-lg cursor-move select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="text-sm font-medium truncate">{conv?.title || "Chat"}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigate(`/inbox`); close(conversationId); }}>
            <Maximize2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => close(conversationId)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1 p-2">
        {isLoading ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
        ) : (
          <div className="space-y-1.5">
            {messages.map((m: any) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`px-2 py-1 rounded-md max-w-[80%] text-xs whitespace-pre-wrap ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {m.body}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </ScrollArea>
      <div className="border-t p-2 flex gap-1">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type…"
          className="h-8 text-xs"
          disabled={sending}
        />
        <Button size="icon" className="h-8 w-8" onClick={handleSend} disabled={!body.trim() || sending}>
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

export const FloatingChats = () => {
  const { windows } = useFloatingChat();
  return (
    <>
      {windows.map((id, i) => (
        <MiniChatWindow key={id} conversationId={id} index={i} />
      ))}
    </>
  );
};