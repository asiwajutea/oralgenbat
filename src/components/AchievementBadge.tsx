import * as LucideIcons from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getBadgeColorClasses } from "@/hooks/useAchievements";
import { format } from "date-fns";

interface AchievementBadgeProps {
  achievement: {
    id: string;
    code: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    criteria_type: string;
    criteria_value: number;
    badge_color: string;
  };
  earned?: boolean;
  earnedAt?: string;
  progress?: number;
  compact?: boolean;
}

const AchievementBadge = ({
  achievement,
  earned = false,
  earnedAt,
  progress = 0,
  compact = false,
}: AchievementBadgeProps) => {
  // Dynamically get the icon component
  const IconComponent = (LucideIcons as any)[achievement.icon] || LucideIcons.Award;
  
  const progressPercentage = Math.min(
    (progress / achievement.criteria_value) * 100,
    100
  );

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-2 rounded-lg border transition-all",
          earned
            ? getBadgeColorClasses(achievement.badge_color)
            : "bg-muted/30 border-muted text-muted-foreground opacity-60"
        )}
      >
        <IconComponent className={cn("h-5 w-5", earned ? "" : "opacity-50")} />
        <div className="min-w-0">
          <p className={cn("text-sm font-medium truncate", !earned && "text-muted-foreground")}>
            {achievement.name}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-center p-4 rounded-xl border-2 transition-all",
        earned
          ? cn(getBadgeColorClasses(achievement.badge_color), "shadow-lg")
          : "bg-muted/20 border-dashed border-muted text-muted-foreground"
      )}
    >
      {/* Badge tier indicator */}
      {earned && (
        <Badge
          variant="outline"
          className={cn(
            "absolute -top-2 -right-2 text-xs capitalize",
            getBadgeColorClasses(achievement.badge_color)
          )}
        >
          {achievement.badge_color}
        </Badge>
      )}

      {/* Icon */}
      <div
        className={cn(
          "flex items-center justify-center w-16 h-16 rounded-full mb-3",
          earned ? "bg-background/50" : "bg-muted/50"
        )}
      >
        <IconComponent
          className={cn(
            "h-8 w-8",
            earned ? "" : "opacity-40"
          )}
        />
      </div>

      {/* Title */}
      <h4 className={cn(
        "text-sm font-semibold text-center mb-1",
        !earned && "text-muted-foreground"
      )}>
        {achievement.name}
      </h4>

      {/* Description */}
      <p className="text-xs text-center text-muted-foreground mb-2 line-clamp-2">
        {achievement.description}
      </p>

      {/* Progress or Earned Date */}
      {earned ? (
        <p className="text-xs text-muted-foreground">
          Earned {earnedAt ? format(new Date(earnedAt), "MMM d, yyyy") : ""}
        </p>
      ) : (
        <div className="w-full space-y-1">
          <Progress value={progressPercentage} className="h-1.5" />
          <p className="text-xs text-center text-muted-foreground">
            {progress} / {achievement.criteria_value}
          </p>
        </div>
      )}
    </div>
  );
};

export default AchievementBadge;
