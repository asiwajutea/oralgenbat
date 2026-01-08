import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Clock, LogOut, Timer, Calendar } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface SessionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

interface SessionRecord {
  id: string;
  session_started_at: string;
  session_ended_at: string | null;
  duration_seconds: number | null;
  logout_reason: string | null;
  created_at: string;
}

const formatDuration = (seconds: number | null) => {
  if (!seconds) return "-";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  } else if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
};

const getLogoutReasonBadge = (reason: string | null) => {
  if (!reason) return null;
  
  const variants: Record<string, { className: string; label: string }> = {
    manual: { className: "bg-green-100 text-green-700", label: "Manual" },
    inactivity: { className: "bg-amber-100 text-amber-700", label: "Inactivity" },
    tab_close: { className: "bg-blue-100 text-blue-700", label: "Tab Closed" },
    session_end: { className: "bg-gray-100 text-gray-700", label: "Session End" },
  };
  
  const variant = variants[reason] || { className: "bg-gray-100 text-gray-700", label: reason };
  
  return (
    <Badge variant="secondary" className={variant.className}>
      {variant.label}
    </Badge>
  );
};

export const SessionHistoryDialog = ({
  open,
  onOpenChange,
  userId,
  userName,
}: SessionHistoryDialogProps) => {
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["session-history", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_session_history")
        .select("*")
        .eq("user_id", userId)
        .order("session_started_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as SessionRecord[];
    },
    enabled: open && !!userId,
  });

  // Calculate total session time
  const totalSessionTime = sessions.reduce((acc, session) => {
    return acc + (session.duration_seconds || 0);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Session History - {userName}
          </DialogTitle>
        </DialogHeader>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 py-4 border-b">
          <div className="text-center">
            <div className="text-2xl font-bold">{sessions.length}</div>
            <div className="text-xs text-muted-foreground">Total Sessions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{formatDuration(totalSessionTime)}</div>
            <div className="text-xs text-muted-foreground">Total Time</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {sessions.length > 0 
                ? formatDuration(Math.round(totalSessionTime / sessions.length))
                : "-"
              }
            </div>
            <div className="text-xs text-muted-foreground">Avg. Session</div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No session history found for this user</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Date
                    </div>
                  </TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Ended</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Timer className="h-4 w-4" />
                      Duration
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <LogOut className="h-4 w-4" />
                      Logout Type
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">
                      {format(new Date(session.session_started_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      {format(new Date(session.session_started_at), "h:mm:ss a")}
                    </TableCell>
                    <TableCell>
                      {session.session_ended_at 
                        ? format(new Date(session.session_ended_at), "h:mm:ss a")
                        : <span className="text-green-600 text-xs">Active</span>
                      }
                    </TableCell>
                    <TableCell>
                      {session.duration_seconds 
                        ? formatDuration(session.duration_seconds)
                        : <span className="text-muted-foreground">-</span>
                      }
                    </TableCell>
                    <TableCell>
                      {getLogoutReasonBadge(session.logout_reason)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};
