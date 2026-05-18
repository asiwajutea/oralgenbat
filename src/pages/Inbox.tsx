import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Megaphone,
  Bell,
  MessageSquare,
  Users,
  User as UserIcon,
  Send,
  Plus,
  ExternalLink,
  CheckCircle2,
  RotateCw,
  RotateCcw,
  Inbox as InboxIcon,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  LogOut,
  ArrowLeft,
  Menu,
  Search as SearchIcon,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { NewChatDialog } from "@/components/chat/NewChatDialog";
import { toast } from "sonner";
import { useConversationParticipants, describeOthers, formatRole } from "@/hooks/useConversationParticipants";
import { AttachmentMenu } from "@/components/chat/AttachmentMenu";
import { useFloatingChat } from "@/components/chat/FloatingChatProvider";
import { Minimize2, Paperclip, FileText } from "lucide-react";
import { Link } from "react-router-dom";

const CATEGORY_META: Record<string, { label: string; icon: any; color: string }> = {
  all: { label: "All", icon: InboxIcon, color: "text-foreground" },
  failed_audit: { label: "Failed Audits", icon: AlertTriangle, color: "text-red-500" },
  tracking_comment: { label: "Tracking Comments", icon: MessageSquare, color: "text-blue-500" },
  announcement: { label: "Announcements", icon: Megaphone, color: "text-purple-500" },
  push: { label: "Notifications", icon: Bell, color: "text-orange-500" },
  direct: { label: "Direct", icon: UserIcon, color: "text-green-500" },
  group: { label: "Groups", icon: Users, color: "text-indigo-500" },
};

type Conversation = {
  id: string;
  title: string | null;
  type: string;
  category: string;
  contractor_id: string | null;
  audit_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  body: string | null;
  message_type: string;
  metadata: any;
  created_at: string;
};

const SidebarCategories = ({
  activeCategory,
  onSelect,
  categoryUnread,
}: {
  activeCategory: string;
  onSelect: (k: string) => void;
  categoryUnread: Record<string, number>;
}) => {
  return (
    <div className="py-2">
      {Object.entries(CATEGORY_META).map(([key, meta]) => {
        const Icon = meta.icon;
        const unread = key === "all"
          ? Object.values(categoryUnread).reduce((s, n) => s + n, 0)
          : categoryUnread[key] || 0;
        const active = activeCategory === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={cn(
              "w-full flex items-center justify-between gap-2 pl-6 pr-3 py-2 text-sm rounded-r-full transition-colors",
              active ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted text-foreground/80"
            )}
          >
            <span className="flex items-center gap-3">
              <Icon className={cn("h-4 w-4", active ? "text-primary" : meta.color)} />
              {meta.label}
            </span>
            {unread > 0 && (
              <span className="text-[11px] font-semibold text-foreground/90">{unread > 99 ? "99+" : unread}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

const Inbox = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMsgId, setDeleteMsgId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [composerAttachments, setComposerAttachments] = useState<any[]>([]);
  const [composerInterview, setComposerInterview] = useState<any | null>(null);
  const [composerLink, setComposerLink] = useState<any | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { open: openFloating } = useFloatingChat();

  // Conversation list
  const { data: conversations = [], isLoading: convLoading } = useQuery({
    queryKey: ["chat-conversations", user?.id],
    queryFn: async () => {
      const { data: parts, error: pErr } = await supabase
        .from("chat_participants")
        .select("conversation_id, unread_count, last_read_at, closed_at")
        .eq("user_id", user!.id)
        .is("removed_at", null);
      if (pErr) throw pErr;
      const ids = (parts || []).map((p) => p.conversation_id);
      if (ids.length === 0) return [] as (Conversation & { unread_count: number })[];
      const { data: convs, error: cErr } = await supabase
        .from("chat_conversations")
        .select("id, title, type, category, contractor_id, audit_id, last_message_at, last_message_preview")
        .in("id", ids)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (cErr) throw cErr;
      const unreadById: Record<string, number> = {};
      const closedById: Record<string, boolean> = {};
      (parts || []).forEach((p) => {
        unreadById[p.conversation_id] = p.unread_count || 0;
        closedById[p.conversation_id] = !!p.closed_at;
      });
      return (convs || []).map((c) => ({
        ...c,
        unread_count: unreadById[c.id] || 0,
        closed: closedById[c.id] || false,
      })) as any;
    },
    enabled: !!user?.id,
    staleTime: 15_000,
  });

  // Realtime: refetch on any change to my participants or messages
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`inbox-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_participants", filter: `user_id=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["chat-conversations", user.id] });
        qc.invalidateQueries({ queryKey: ["chat-unread-total", user.id] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload: any) => {
        const convId = payload.new?.conversation_id;
        if (convId) {
          qc.invalidateQueries({ queryKey: ["chat-messages", convId] });
          qc.invalidateQueries({ queryKey: ["chat-conversations", user.id] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  // Filter conversations
  const filteredConvs = useMemo(() => {
    let list = conversations as (Conversation & { unread_count: number })[];
    if (activeCategory !== "all") list = list.filter((c) => c.category === activeCategory);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((c) =>
        (c.title || "").toLowerCase().includes(s) ||
        (c.last_message_preview || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [conversations, activeCategory, search]);

  const openConvs = useMemo(() => filteredConvs.filter((c: any) => !c.closed), [filteredConvs]);
  const closedConvs = useMemo(() => filteredConvs.filter((c: any) => c.closed), [filteredConvs]);

  // Participants per visible conversation
  const visibleConvIds = useMemo(() => filteredConvs.map((c) => c.id), [filteredConvs]);
  const { data: participantsByConv = {} } = useConversationParticipants(visibleConvIds);

  // Note: do NOT auto-select — Gmail-style: show list first, user taps a thread to open it.

  const selectedConv = useMemo(
    () => (conversations as any[]).find((c) => c.id === selectedConvId) as (Conversation & { unread_count: number }) | undefined,
    [conversations, selectedConvId]
  );

  // Messages for selected conversation
  const { data: messages = [], isLoading: msgLoading } = useQuery({
    queryKey: ["chat-messages", selectedConvId],
    queryFn: async () => {
      if (!selectedConvId) return [] as Message[];
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", selectedConvId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled: !!selectedConvId,
    staleTime: 5_000,
  });

  // Sender profile lookup
  const senderIds = useMemo(() => Array.from(new Set(messages.map((m) => m.sender_id).filter(Boolean) as string[])), [messages]);
  const { data: senderProfiles = {} } = useQuery({
    queryKey: ["chat-senders", senderIds.sort().join(",")],
    queryFn: async () => {
      if (senderIds.length === 0) return {} as Record<string, { full_name: string }>;
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", senderIds);
      const map: Record<string, { full_name: string }> = {};
      (data || []).forEach((p) => { map[p.id] = { full_name: p.full_name }; });
      return map;
    },
    enabled: senderIds.length > 0,
    staleTime: 60_000,
  });

  // Mark conversation read on open
  useEffect(() => {
    if (!selectedConvId || !selectedConv?.unread_count) return;
    supabase.rpc("mark_conversation_read", { _conversation_id: selectedConvId }).then(() => {
      qc.invalidateQueries({ queryKey: ["chat-conversations", user?.id] });
      qc.invalidateQueries({ queryKey: ["chat-unread-total", user?.id] });
    });
  }, [selectedConvId, selectedConv?.unread_count, qc, user?.id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedConvId]);

  const handleSend = async () => {
    if ((!composer.trim() && composerAttachments.length === 0 && !composerInterview && !composerLink) || !selectedConvId) return;
    setSending(true);
    try {
      const meta: any = {};
      if (composerAttachments.length) meta.attachments = composerAttachments;
      if (composerInterview) meta.interview_ref = composerInterview;
      if (composerLink) meta.internal_link = composerLink;
      const { error } = await supabase.from("chat_messages").insert({
        conversation_id: selectedConvId,
        sender_id: user!.id,
        body: composer.trim() || null,
        message_type: "text",
        metadata: Object.keys(meta).length ? meta : {},
      });
      if (error) throw error;
      setComposer("");
      setComposerAttachments([]);
      setComposerInterview(null);
      setComposerLink(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const initials = (name?: string | null) =>
    (name || "?")
      .split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const handleRename = async () => {
    if (!selectedConvId || !renameValue.trim()) return;
    const { error } = await supabase.rpc("rename_conversation", {
      _conversation_id: selectedConvId,
      _new_title: renameValue.trim(),
    });
    if (error) { toast.error(error.message); return; }
    setRenameOpen(false);
    qc.invalidateQueries({ queryKey: ["chat-conversations", user?.id] });
    toast.success("Subject updated");
  };

  const handleDeleteConversation = async () => {
    if (!selectedConvId) return;
    const { error } = await supabase.rpc("delete_conversation", { _conversation_id: selectedConvId });
    if (error) { toast.error(error.message); return; }
    setDeleteOpen(false);
    setSelectedConvId(null);
    qc.invalidateQueries({ queryKey: ["chat-conversations", user?.id] });
    toast.success("Conversation deleted");
  };

  const handleLeaveConversation = async () => {
    if (!selectedConvId) return;
    const { error } = await supabase.rpc("leave_conversation", { _conversation_id: selectedConvId });
    if (error) { toast.error(error.message); return; }
    setSelectedConvId(null);
    qc.invalidateQueries({ queryKey: ["chat-conversations", user?.id] });
    toast.success("Left conversation");
  };

  const handleDeleteMessage = async (messageId: string) => {
    const { error } = await supabase.from("chat_messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["chat-messages", selectedConvId] });
  };

  // Unread totals per category
  const categoryUnread = useMemo(() => {
    const m: Record<string, number> = {};
    (conversations as any[]).forEach((c: any) => {
      m[c.category] = (m[c.category] || 0) + (c.unread_count || 0);
    });
    return m;
  }, [conversations]);

  return (
    <div className="h-[calc(100dvh-4rem)] flex flex-col bg-background">
      <div className="flex-1 grid md:grid-cols-[240px_1fr] overflow-hidden min-h-0">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col border-r bg-card min-h-0">
          <div className="p-3 border-b">
            <Button onClick={() => setShowNewChat(true)} className="w-full gap-2 rounded-2xl shadow-sm">
              <Plus className="h-4 w-4" /> New chat
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <SidebarCategories
              activeCategory={activeCategory}
              onSelect={(k) => { setActiveCategory(k); setSelectedConvId(null); }}
              categoryUnread={categoryUnread}
            />
          </ScrollArea>
        </aside>

        {/* Main pane */}
        <main className="flex flex-col min-w-0 min-h-0 overflow-hidden bg-background">
          {/* Top toolbar */}
          <div className="flex items-center gap-2 px-2 sm:px-4 py-2 border-b bg-card">
            {/* Mobile menu / back */}
            {selectedConvId ? (
              <Button variant="ghost" size="icon" onClick={() => setSelectedConvId(null)} className="md:hidden">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            ) : (
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <div className="p-3 border-b">
                    <Button
                      onClick={() => { setShowNewChat(true); setSidebarOpen(false); }}
                      className="w-full gap-2 rounded-2xl"
                    >
                      <Plus className="h-4 w-4" /> New chat
                    </Button>
                  </div>
                  <ScrollArea className="h-[calc(100dvh-5rem)]">
                    <SidebarCategories
                      activeCategory={activeCategory}
                      onSelect={(k) => { setActiveCategory(k); setSelectedConvId(null); setSidebarOpen(false); }}
                      categoryUnread={categoryUnread}
                    />
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            )}

            {selectedConvId && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedConvId(null)} className="hidden md:inline-flex gap-1">
                <ArrowLeft className="h-4 w-4" /> Inbox
              </Button>
            )}

            {!selectedConvId && (
              <div className="flex items-center gap-2 flex-1 max-w-2xl">
                <div className="relative flex-1">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search mail"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 rounded-full bg-muted/40 border-0 focus-visible:ring-1"
                  />
                </div>
                <Button variant="default" size="sm" onClick={() => setShowNewChat(true)} className="gap-1 md:hidden">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}

            {!selectedConvId && (
              <span className="ml-auto text-xs text-muted-foreground hidden sm:inline">
                {openConvs.length} thread{openConvs.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {/* Body: list or thread */}
          {!selectedConvId ? (
            <ScrollArea className="flex-1">
              {convLoading ? (
                <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : filteredConvs.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  <InboxIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  No conversations yet.
                </div>
              ) : (
                <ul className="divide-y">
                  {openConvs.map((c: any) => {
                    const meta = CATEGORY_META[c.category] || CATEGORY_META.all;
                    const Icon = meta.icon;
                    const subtitle = describeOthers(participantsByConv[c.id], user?.id) || "";
                    const unread = c.unread_count > 0;
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => setSelectedConvId(c.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 sm:px-4 py-3 text-left hover:bg-muted/60 transition-colors",
                            unread && "bg-accent/30"
                          )}
                        >
                          <Avatar className="h-9 w-9 flex-shrink-0">
                            <AvatarFallback className={cn("text-xs", unread && "font-semibold")}>
                              {initials(c.title || subtitle || "?")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={cn("truncate text-sm", unread ? "font-bold text-foreground" : "font-medium text-foreground/90")}>
                                {c.title || subtitle || "(untitled)"}
                              </span>
                              <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", meta.color)} />
                              {unread && (
                                <Badge variant="default" className="h-5 px-1.5 text-[10px]">{c.unread_count}</Badge>
                              )}
                              <span className="ml-auto text-[10px] text-muted-foreground flex-shrink-0">
                                {c.last_message_at && formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false })}
                              </span>
                            </div>
                            <p className={cn("text-xs truncate mt-0.5", unread ? "text-foreground/80" : "text-muted-foreground")}>
                              {c.last_message_preview || subtitle || "—"}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                  {closedConvs.length > 0 && (
                    <li className="border-t bg-muted/20">
                      <button
                        onClick={() => setShowClosed((v) => !v)}
                        className="w-full text-left text-xs font-medium text-muted-foreground px-4 py-2 hover:bg-muted"
                      >
                        {showClosed ? "▾" : "▸"} Closed ({closedConvs.length})
                      </button>
                      {showClosed && (
                        <ul className="divide-y">
                          {closedConvs.map((c: any) => (
                            <li key={c.id}>
                              <button
                                onClick={() => setSelectedConvId(c.id)}
                                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-muted opacity-70 italic"
                              >
                                <Avatar className="h-8 w-8 flex-shrink-0">
                                  <AvatarFallback className="text-[10px]">{initials(c.title || "?")}</AvatarFallback>
                                </Avatar>
                                <span className="text-sm truncate">{c.title || "(untitled)"}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground">Closed</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )}
                </ul>
              )}
            </ScrollArea>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {!selectedConv ? (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  Loading conversation…
                </div>
              ) : (
                <>
              <div className="border-b px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{selectedConv.title || "(untitled)"}</h3>
                    <p className="text-xs text-muted-foreground">
                      <span className="capitalize">{selectedConv.category.replace("_", " ")}</span>
                      {(() => {
                        const others = (participantsByConv[selectedConv.id] || []).filter((p) => p.user_id !== user?.id);
                        if (others.length === 0) return null;
                        return (
                          <> · with {others.map((o) => `${o.full_name || "Unknown"}${o.role ? ` (${formatRole(o.role)})` : ""}`).join(", ")}</>
                        );
                      })()}
                      {selectedConv.contractor_id ? ` · ${selectedConv.contractor_id}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openFloating(selectedConv.id)}
                    title="Minimize as floating chat"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                  {selectedConv.audit_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/review/${selectedConv.audit_id}`)}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" /> Open Review
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setRenameValue(selectedConv.title || ""); setRenameOpen(true); }}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit subject
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleLeaveConversation}>
                        <LogOut className="h-4 w-4 mr-2" /> Leave conversation
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteOpen(true)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete conversation
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <ScrollArea className="flex-1 px-4 py-3">
                {msgLoading ? (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((m) => {
                      const mine = m.sender_id === user?.id;
                      const sender = m.sender_id ? senderProfiles[m.sender_id] : null;
                      if (m.message_type === "audit_action") {
                        return (
                          <div key={m.id} className="border rounded-md p-3 bg-muted/40">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                              <span className="font-semibold text-sm">{m.body}</span>
                            </div>
                            {m.metadata?.review_comment && (
                              <div className="mb-2">
                                <p className="text-xs font-medium text-muted-foreground mb-0.5">Reviewer comment</p>
                                <p className="text-sm whitespace-pre-wrap">{m.metadata.review_comment}</p>
                              </div>
                            )}
                            {m.metadata?.action_plan && (
                              <div className="mb-2">
                                <p className="text-xs font-medium text-muted-foreground mb-0.5">Action plan</p>
                                <p className="text-sm whitespace-pre-wrap">{m.metadata.action_plan}</p>
                              </div>
                            )}
                            {Array.isArray(m.metadata?.artifact_correction) && m.metadata.artifact_correction.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {m.metadata.artifact_correction.map((a: string) => (
                                  <Badge key={a} variant="outline">{a}</Badge>
                                ))}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2 mt-2">
                              {m.metadata?.audit_id && (
                                <Button size="sm" variant="default" onClick={() => navigate(`/review/${m.metadata.audit_id}`)}>
                                  <ExternalLink className="h-3 w-3 mr-1" /> View interview
                                </Button>
                              )}
                              {m.metadata?.audit_id && (
                                <Button size="sm" variant="outline" onClick={() => navigate(`/interview-tracking?audit=${m.metadata.audit_id}`)}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Manage on tracking
                                </Button>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2">
                              {format(new Date(m.created_at), "PPp")}
                            </p>
                          </div>
                        );
                      }
                      return (
                        <div key={m.id} className={cn("flex gap-2", mine ? "justify-end" : "justify-start")}>
                          {!mine && (
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[10px]">{initials(sender?.full_name)}</AvatarFallback>
                            </Avatar>
                          )}
                          <div className={cn("max-w-[75%] group")}>
                            {!mine && sender && (
                              <p className="text-[10px] text-muted-foreground mb-0.5">{sender.full_name}</p>
                            )}
                            <div className="flex items-start gap-1">
                              <div className={cn(
                                "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                                mine ? "bg-primary text-primary-foreground" : "bg-muted"
                              )}>
                                {m.body}
                                {m.metadata?.interview_ref && (
                                  <Link
                                    to={`/review/${m.metadata.interview_ref.audit_id}`}
                                    className="mt-1 flex items-center gap-1 text-xs underline decoration-dotted"
                                  >
                                    <FileText className="h-3 w-3" /> {m.metadata.interview_ref.file_name}
                                  </Link>
                                )}
                                {m.metadata?.internal_link && (
                                  <Link
                                    to={m.metadata.internal_link.path}
                                    className="mt-1 flex items-center gap-1 text-xs underline decoration-dotted"
                                  >
                                    <ExternalLink className="h-3 w-3" /> {m.metadata.internal_link.label}
                                  </Link>
                                )}
                                {Array.isArray(m.metadata?.attachments) && m.metadata.attachments.length > 0 && (
                                  <div className="mt-1 space-y-1">
                                    {m.metadata.attachments.map((a: any, i: number) => (
                                      <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs underline decoration-dotted">
                                        <Paperclip className="h-3 w-3" /> {a.name}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {mine && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                  onClick={() => handleDeleteMessage(m.id)}
                                  aria-label="Delete message"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              <div className="border-t p-3 space-y-2">
                {(composerAttachments.length > 0 || composerInterview || composerLink) && (
                  <div className="flex flex-wrap gap-1">
                    {composerAttachments.map((a, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        <Paperclip className="h-3 w-3" /> {a.name}
                        <button onClick={() => setComposerAttachments((p) => p.filter((_, j) => j !== i))} className="ml-1">×</button>
                      </Badge>
                    ))}
                    {composerInterview && (
                      <Badge variant="secondary" className="gap-1">
                        <FileText className="h-3 w-3" /> {composerInterview.file_name}
                        <button onClick={() => setComposerInterview(null)} className="ml-1">×</button>
                      </Badge>
                    )}
                    {composerLink && (
                      <Badge variant="secondary" className="gap-1">
                        <ExternalLink className="h-3 w-3" /> {composerLink.label}
                        <button onClick={() => setComposerLink(null)} className="ml-1">×</button>
                      </Badge>
                    )}
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <AttachmentMenu
                    onAttach={(a) => setComposerAttachments((p) => [...p, a])}
                    onInterview={(r) => setComposerInterview(r)}
                    onLink={(l) => setComposerLink(l)}
                  />
                  <Input
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type a message…"
                    disabled={sending}
                  />
                  <Button onClick={handleSend} disabled={(!composer.trim() && composerAttachments.length === 0 && !composerInterview && !composerLink) || sending}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>

      <NewChatDialog
        open={showNewChat}
        onOpenChange={setShowNewChat}
        onCreated={(id) => { setSelectedConvId(id); qc.invalidateQueries({ queryKey: ["chat-conversations", user?.id] }); }}
      />

      {/* Rename dialog */}
      <AlertDialog open={renameOpen} onOpenChange={setRenameOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit subject</AlertDialogTitle>
            <AlertDialogDescription>Update the conversation title. Visible to all participants.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRename}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes all messages and cannot be undone. Only owners and admins can delete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConversation} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Inbox;