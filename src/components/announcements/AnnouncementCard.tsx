import { format } from "date-fns";
import { Megaphone, AlertTriangle, CheckCircle, Info, Calendar, Clock, Users, Trash2, Edit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Announcement } from "@/hooks/useAnnouncements";

interface AnnouncementCardProps {
  announcement: Announcement;
  isCreator?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
}

const styleConfig = {
  info: {
    icon: Info,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  success: {
    icon: CheckCircle,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  announcement: {
    icon: Megaphone,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
};

const targetLabels = {
  all: "All Users",
  contractor: "Contractor Group",
  role: "Role",
  user: "Specific Users",
};

export const AnnouncementCard = ({
  announcement,
  isCreator = false,
  onEdit,
  onDelete,
  onClick,
}: AnnouncementCardProps) => {
  const config = styleConfig[announcement.style] || styleConfig.info;
  const Icon = config.icon;

  return (
    <Card 
      className={cn(
        "transition-all hover:shadow-md cursor-pointer",
        config.border
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={cn("p-2 rounded-lg", config.bg)}>
              <Icon className={cn("h-5 w-5", config.color)} />
            </div>
            <div>
              <CardTitle className="text-lg">{announcement.title}</CardTitle>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(announcement.created_at), "PPP")}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!announcement.is_active && (
              <Badge variant="secondary">Inactive</Badge>
            )}
            {announcement.scheduled_at && new Date(announcement.scheduled_at) > new Date() && (
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                Scheduled
              </Badge>
            )}
            {isCreator && (
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onEdit}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <p className="text-muted-foreground line-clamp-3 mb-4">
          {announcement.content}
        </p>
        
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3 w-3" />
            {targetLabels[announcement.target_type]}
            {announcement.target_contractor_id && `: ${announcement.target_contractor_id}`}
            {announcement.target_role && `: ${announcement.target_role}`}
          </Badge>
          
          <Badge variant="outline">
            {announcement.display_frequency === "once" && "Show Once"}
            {announcement.display_frequency === "every_login" && "Every Login"}
            {announcement.display_frequency === "daily" && "Daily"}
            {announcement.display_frequency === "weekly" && "Weekly"}
          </Badge>
          
          {announcement.require_acknowledgment && (
            <Badge variant="outline">Requires Acknowledgment</Badge>
          )}
          
          {announcement.expires_at && (
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              Expires: {format(new Date(announcement.expires_at), "PP")}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
