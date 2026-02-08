import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Loader2, 
  CheckCircle, 
  MessageCircle, 
  Send,
  User
} from "lucide-react";
import { format } from "date-fns";

interface Comment {
  id: string;
  audit_id: string;
  user_id: string;
  parent_comment_id: string | null;
  comment: string;
  created_at: string;
  user_name?: string;
}

interface ResolvedCommentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auditId: string;
  fileName: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export function ResolvedCommentsModal({
  open,
  onOpenChange,
  auditId,
  fileName,
  resolvedAt,
  resolvedBy,
}: ResolvedCommentsModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newReply, setNewReply] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);

  // Fetch comments for this audit
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["artifact-comments", auditId],
    queryFn: async () => {
      const { data: commentsData, error } = await supabase
        .from("artifact_correction_comments")
        .select("*")
        .eq("audit_id", auditId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Fetch user names for each comment - use function to get display name
      if (commentsData && commentsData.length > 0) {
        const userIds = [...new Set(commentsData.map((c) => c.user_id))];
        
        // Fetch profiles for user names
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);

        const profileMap = new Map(
          profiles?.map((p) => [p.id, p.full_name]) || []
        );

        return commentsData.map((c) => ({
          ...c,
          user_name: profileMap.get(c.user_id) || "Unknown User",
        })) as Comment[];
      }

      return [] as Comment[];
    },
    enabled: open && !!auditId,
  });

  // Mark comments as read when modal opens
  useEffect(() => {
    const markAsRead = async () => {
      if (open && auditId && user?.id && comments.length > 0) {
        // Mark all unread comments as read for this user (comments not created by this user)
        const unreadCommentIds = comments
          .filter((c) => c.user_id !== user.id && !(c as any).is_read)
          .map((c) => c.id);

        if (unreadCommentIds.length > 0) {
          await supabase
            .from("artifact_correction_comments")
            .update({ is_read: true })
            .in("id", unreadCommentIds);
        }
      }
    };
    markAsRead();
  }, [open, auditId, user?.id, comments]);

  // Fetch resolver's name
  const { data: resolverName } = useQuery({
    queryKey: ["resolver-name", resolvedBy],
    queryFn: async () => {
      if (!resolvedBy) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", resolvedBy)
        .single();
      return data?.full_name || "Unknown User";
    },
    enabled: !!resolvedBy,
  });

  // Add reply mutation
  const addReplyMutation = useMutation({
    mutationFn: async ({
      parentCommentId,
      replyText,
    }: {
      parentCommentId: string | null;
      replyText: string;
    }) => {
      const { error } = await supabase
        .from("artifact_correction_comments")
        .insert({
          audit_id: auditId,
          user_id: user?.id,
          parent_comment_id: parentCommentId,
          comment: replyText.trim(),
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["artifact-comments", auditId] });
      setNewReply("");
      setReplyingToId(null);
      toast({
        title: "Reply added",
        description: "Your reply has been posted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add reply",
        variant: "destructive",
      });
    },
  });

  const handleSendReply = (parentId: string | null = null) => {
    if (!newReply.trim()) return;
    addReplyMutation.mutate({
      parentCommentId: parentId,
      replyText: newReply,
    });
  };

  // Group comments: top-level and their replies
  const topLevelComments = comments.filter((c) => !c.parent_comment_id);
  const repliesMap = new Map<string, Comment[]>();
  comments
    .filter((c) => c.parent_comment_id)
    .forEach((reply) => {
      const existing = repliesMap.get(reply.parent_comment_id!) || [];
      repliesMap.set(reply.parent_comment_id!, [...existing, reply]);
    });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Resolution Details
          </DialogTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="font-mono text-xs">
              {fileName}
            </Badge>
          </div>
        </DialogHeader>

        {/* Resolution Info */}
        <div className="rounded-lg border bg-green-50 dark:bg-green-900/20 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="font-medium text-green-700 dark:text-green-400">
              Marked as Resolved
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            <span>By {resolverName || "Unknown"}</span>
            {resolvedAt && (
              <span> • {format(new Date(resolvedAt), "MMM d, yyyy 'at' h:mm a")}</span>
            )}
          </div>
        </div>

        <Separator />

        {/* Comments Section */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Comments ({comments.length})
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              <MessageCircle className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No comments yet</p>
              <p className="text-xs">Be the first to add a comment</p>
            </div>
          ) : (
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-4">
                {topLevelComments.map((comment) => (
                  <div key={comment.id} className="space-y-2">
                    {/* Main comment */}
                    <div className="flex gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getInitials(comment.user_name || "U")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {comment.user_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(comment.created_at), "MMM d, h:mm a")}
                          </span>
                        </div>
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                          {comment.comment}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground mt-1"
                          onClick={() => setReplyingToId(comment.id)}
                        >
                          Reply
                        </Button>
                      </div>
                    </div>

                    {/* Replies */}
                    {repliesMap.get(comment.id)?.map((reply) => (
                      <div key={reply.id} className="flex gap-3 ml-10">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] bg-secondary text-secondary-foreground">
                            {getInitials(reply.user_name || "U")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {reply.user_name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(reply.created_at), "MMM d, h:mm a")}
                            </span>
                          </div>
                          <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">
                            {reply.comment}
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Reply input for this comment */}
                    {replyingToId === comment.id && (
                      <div className="flex gap-2 ml-10 mt-2">
                        <Textarea
                          placeholder="Write a reply..."
                          value={newReply}
                          onChange={(e) => setNewReply(e.target.value)}
                          rows={2}
                          className="flex-1 text-sm"
                        />
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            onClick={() => handleSendReply(comment.id)}
                            disabled={!newReply.trim() || addReplyMutation.isPending}
                          >
                            {addReplyMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReplyingToId(null);
                              setNewReply("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <Separator />

        {/* New Comment Input */}
        <div className="flex gap-2 pt-2">
          <Textarea
            placeholder="Add a comment..."
            value={replyingToId ? "" : newReply}
            onChange={(e) => {
              if (!replyingToId) setNewReply(e.target.value);
            }}
            rows={2}
            className="flex-1"
            disabled={!!replyingToId}
          />
          <Button
            onClick={() => handleSendReply(null)}
            disabled={!newReply.trim() || !!replyingToId || addReplyMutation.isPending}
            className="self-end"
          >
            {addReplyMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
