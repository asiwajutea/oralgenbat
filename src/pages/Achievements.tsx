import { Trophy, Filter } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import AchievementBadge from "@/components/AchievementBadge";
import { 
  useAchievements, 
  categoryDisplayNames,
  getBadgeColorClasses 
} from "@/hooks/useAchievements";
import { cn } from "@/lib/utils";

const Achievements = () => {
  const [filter, setFilter] = useState<"all" | "earned" | "locked">("all");
  const {
    achievementsByCategory,
    userAchievements,
    totalEarned,
    totalAvailable,
    isEarned,
    getProgress,
    isLoading,
  } = useAchievements();

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  const overallProgress = totalAvailable > 0 
    ? Math.round((totalEarned / totalAvailable) * 100) 
    : 0;

  // Create a map of earned achievements with their dates
  const earnedMap = new Map(
    userAchievements.map(ua => [ua.achievement_id, ua.earned_at])
  );

  // Filter achievements based on selected filter
  const filterAchievements = (achievements: any[]) => {
    switch (filter) {
      case "earned":
        return achievements.filter(a => isEarned(a.id));
      case "locked":
        return achievements.filter(a => !isEarned(a.id));
      default:
        return achievements;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Trophy className="h-8 w-8 text-yellow-500" />
            Achievements
          </h1>
          <p className="text-muted-foreground mt-1">
            Track your progress and earn badges for your accomplishments
          </p>
        </div>
        
        {/* Filter Tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="earned">Earned</TabsTrigger>
            <TabsTrigger value="locked">Locked</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Overall Progress Card */}
      <Card className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20 border-yellow-200 dark:border-yellow-800">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">
                {totalEarned} of {totalAvailable}
              </h2>
              <p className="text-muted-foreground">achievements unlocked</p>
            </div>
            <div className="flex-1 max-w-md">
              <Progress value={overallProgress} className="h-3" />
              <p className="text-sm text-muted-foreground text-right mt-1">
                {overallProgress}% complete
              </p>
            </div>
          </div>
          
          {/* Badge tier legend */}
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-yellow-200 dark:border-yellow-800">
            <span className="text-sm text-muted-foreground mr-2">Tiers:</span>
            {["bronze", "silver", "gold", "platinum"].map(tier => (
              <Badge 
                key={tier} 
                variant="outline"
                className={cn("capitalize", getBadgeColorClasses(tier))}
              >
                {tier}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Achievement Categories */}
      {Object.entries(achievementsByCategory).map(([category, achievements]) => {
        const filteredAchievements = filterAchievements(achievements);
        
        if (filteredAchievements.length === 0) return null;
        
        const categoryEarned = achievements.filter(a => isEarned(a.id)).length;
        
        return (
          <Card key={category}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {categoryDisplayNames[category] || category}
                    <Badge variant="outline">
                      {categoryEarned}/{achievements.length}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {category === "general" && "Achievements for all users"}
                    {category === "auditor" && "Achievements for audit reviewers"}
                    {category === "field_manager" && "Achievements for field managers"}
                    {category === "contractor" && "Achievements for contractors"}
                    {category === "admin" && "Achievements for administrators"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {filteredAchievements.map((achievement) => {
                  const earned = isEarned(achievement.id);
                  const progressData = getProgress(achievement.id);
                  
                  return (
                    <AchievementBadge
                      key={achievement.id}
                      achievement={achievement}
                      earned={earned}
                      earnedAt={earnedMap.get(achievement.id)}
                      progress={progressData?.current_value || 0}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Empty State */}
      {filter !== "all" && Object.values(achievementsByCategory).every(
        achievements => filterAchievements(achievements).length === 0
      ) && (
        <Card className="p-12 text-center">
          <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">
            {filter === "earned" ? "No achievements earned yet" : "All achievements unlocked!"}
          </h3>
          <p className="text-muted-foreground">
            {filter === "earned" 
              ? "Keep using the app to earn your first achievement!"
              : "Congratulations on unlocking all available achievements!"}
          </p>
        </Card>
      )}
    </div>
  );
};

export default Achievements;
