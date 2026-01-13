import { useNavigate } from "react-router-dom";
import * as LucideIcons from "lucide-react";
import { Trophy, ArrowRight, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAchievements, getBadgeColorClasses } from "@/hooks/useAchievements";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const RecentAchievementBadge = () => {
  const navigate = useNavigate();
  const { recentAchievement, totalEarned, totalAvailable, isLoading } = useAchievements();

  if (isLoading) {
    return null;
  }

  // If no achievements earned yet, show encouragement
  if (!recentAchievement) {
    return (
      <Card className="bg-gradient-to-br from-muted/50 to-muted/20 border-dashed">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="flex-shrink-0 p-3 bg-muted rounded-full">
            <Trophy className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">No achievements yet</p>
            <p className="text-xs text-muted-foreground">
              Keep using the app to earn your first badge!
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate("/achievements")}
            className="flex-shrink-0"
          >
            View All
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  const achievement = recentAchievement.achievements;
  const IconComponent = (LucideIcons as any)[achievement.icon] || LucideIcons.Award;

  return (
    <Card 
      className={cn(
        "overflow-hidden cursor-pointer hover:shadow-md transition-shadow",
        "bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 border-yellow-200 dark:border-yellow-800"
      )}
      onClick={() => navigate("/achievements")}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Achievement Icon */}
          <div 
            className={cn(
              "flex-shrink-0 p-3 rounded-full border-2",
              getBadgeColorClasses(achievement.badge_color)
            )}
          >
            <IconComponent className="h-6 w-6" />
          </div>
          
          {/* Achievement Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Latest Achievement
              </span>
            </div>
            <p className="font-semibold truncate">{achievement.name}</p>
            <p className="text-xs text-muted-foreground">
              Earned {formatDistanceToNow(new Date(recentAchievement.earned_at), { addSuffix: true })}
            </p>
          </div>
          
          {/* Stats & Action */}
          <div className="flex-shrink-0 text-right">
            <Badge variant="outline" className="mb-1">
              {totalEarned}/{totalAvailable}
            </Badge>
            <p className="text-xs text-muted-foreground">earned</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RecentAchievementBadge;
