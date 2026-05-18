import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, FileText, AlertTriangle, RefreshCw, Trophy, Clock, Megaphone, UserCheck, UserX, CreditCard, ClipboardCheck, Users, PackageCheck, Send, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const getNotificationIcon = (type: string) => {
  switch (type) {
    case "new_interview":
      return <FileText className="h-4 w-4 text-blue-500" />;
    case "failed_audit":
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case "audit_passed":
      return <Check className="h-4 w-4 text-green-500" />;
    case "re_audit":
    case "artifact_replaced":
      return <RefreshCw className="h-4 w-4 text-orange-500" />;
    case "milestone":
      return <Trophy className="h-4 w-4 text-yellow-500" />;
    case "inactivity":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "issue_resolved":
      return <Check className="h-4 w-4 text-green-500" />;
    case "flagged_issue":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "announcement":
      return <Megaphone className="h-4 w-4 text-purple-500" />;
    case "team_request_approved":
      return <UserCheck className="h-4 w-4 text-green-500" />;
    case "team_request_rejected":
      return <UserX className="h-4 w-4 text-red-500" />;
    case "new_team_request":
      return <Users className="h-4 w-4 text-blue-500" />;
    case "interview_assigned":
      return <ClipboardCheck className="h-4 w-4 text-blue-500" />;
    case "data_entry_complete":
      return <PackageCheck className="h-4 w-4 text-green-500" />;
    case "account_approved":
      return <UserCheck className="h-4 w-4 text-green-500" />;
    case "account_suspended":
      return <UserX className="h-4 w-4 text-red-500" />;
    case "new_registration":
      return <Users className="h-4 w-4 text-blue-500" />;
    case "payment_created":
    case "journey_updated":
      return <CreditCard className="h-4 w-4 text-green-500" />;
    case "agent_reassigned":
      return <ArrowRightLeft className="h-4 w-4 text-orange-500" />;
    case "sms_sent":
      return <Send className="h-4 w-4 text-blue-500" />;
    case "comment_reply":
    case "resolution_comment":
      return <FileText className="h-4 w-4 text-blue-500" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" />;
  }
};

const getNotificationRoute = (notification: any): string | null => {
  const type = notification.type;
  const meta = notification.metadata;

  switch (type) {
    case "comment_reply":
    case "resolution_comment":
      return meta?.audit_id ? `/review/${meta.audit_id}?showComments=true` : null;
    case "issue_resolved":
    case "flagged_issue":
      return "/data-entry";
    case "announcement":
      return "/notices";
    case "milestone":
      return "/achievements";
    case "team_request_approved":
    case "team_request_rejected":
    case "agent_reassigned":
      return "/team-management";
    case "new_team_request":
      return "/team-approvals";
    case "interview_assigned":
    case "data_entry_complete":
      return "/data-entry";
    case "account_approved":
    case "account_suspended":
      return "/";
    case "new_registration":
      return "/admin";
    case "payment_created":
    case "journey_updated":
      return "/payment-tracking";
    case "sms_sent":
      return "/sms-logs";
    default:
      return meta?.audit_id ? `/review/${meta.audit_id}` : null;
  }
};

const NotificationBell = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead,
    notificationsLoading 
  } = useNotifications();

  const handleNotificationClick = (notification: any) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    
    const route = getNotificationRoute(notification);
    if (route) {
      navigate(route);
      setOpen(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-auto py-1 px-2 text-xs"
              onClick={() => markAllAsRead()}
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {notificationsLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            {notifications.slice(0, 20).map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  "flex items-start gap-3 p-3 cursor-pointer",
                  !notification.is_read && "bg-muted/50"
                )}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm truncate",
                    !notification.is_read && "font-medium"
                  )}>
                    {notification.title}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                  </p>
                </div>
                {!notification.is_read && (
                  <div className="flex-shrink-0">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                )}
              </DropdownMenuItem>
            ))}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
