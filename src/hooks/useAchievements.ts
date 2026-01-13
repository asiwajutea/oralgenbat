import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  criteria_type: string;
  criteria_value: number;
  criteria_field: string | null;
  badge_color: string;
}

interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  earned_at: string;
  progress_value: number;
  achievements: Achievement;
}

interface AchievementProgress {
  id: string;
  user_id: string;
  achievement_id: string;
  current_value: number;
  updated_at: string;
}

export const useAchievements = () => {
  const { user, userRole } = useAuth();

  // Fetch all achievements
  const { data: allAchievements = [], isLoading: achievementsLoading } = useQuery({
    queryKey: ["all-achievements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("achievements")
        .select("*")
        .order("category", { ascending: true });
      
      if (error) throw error;
      return data as Achievement[];
    },
  });

  // Fetch user's earned achievements
  const { data: userAchievements = [], isLoading: userAchievementsLoading } = useQuery({
    queryKey: ["user-achievements", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("user_achievements")
        .select("*, achievements(*)")
        .eq("user_id", user.id)
        .order("earned_at", { ascending: false });
      
      if (error) throw error;
      return data as UserAchievement[];
    },
    enabled: !!user?.id,
  });

  // Fetch user's achievement progress
  const { data: progress = [], isLoading: progressLoading } = useQuery({
    queryKey: ["achievement-progress", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from("user_achievement_progress")
        .select("*")
        .eq("user_id", user.id);
      
      if (error) throw error;
      return data as AchievementProgress[];
    },
    enabled: !!user?.id,
  });

  // Get the most recent achievement
  const recentAchievement = userAchievements[0] || null;

  // Get earned achievement IDs for easy lookup
  const earnedAchievementIds = new Set(userAchievements.map(ua => ua.achievement_id));

  // Filter achievements relevant to user's role
  const relevantCategories = ["general"];
  if (userRole === "auditor") relevantCategories.push("auditor");
  if (userRole === "field_manager") relevantCategories.push("field_manager");
  if (userRole === "contractor") relevantCategories.push("contractor");
  if (userRole === "admin" || userRole === "super_admin") {
    relevantCategories.push("admin", "auditor", "field_manager", "contractor");
  }

  const relevantAchievements = allAchievements.filter(
    a => relevantCategories.includes(a.category)
  );

  // Get progress for a specific achievement
  const getProgress = (achievementId: string) => {
    return progress.find(p => p.achievement_id === achievementId);
  };

  // Check if an achievement is earned
  const isEarned = (achievementId: string) => {
    return earnedAchievementIds.has(achievementId);
  };

  // Group achievements by category
  const achievementsByCategory = relevantAchievements.reduce((acc, achievement) => {
    if (!acc[achievement.category]) {
      acc[achievement.category] = [];
    }
    acc[achievement.category].push(achievement);
    return acc;
  }, {} as Record<string, Achievement[]>);

  // Count totals
  const totalEarned = userAchievements.length;
  const totalAvailable = relevantAchievements.length;

  return {
    allAchievements,
    userAchievements,
    relevantAchievements,
    achievementsByCategory,
    recentAchievement,
    progress,
    getProgress,
    isEarned,
    totalEarned,
    totalAvailable,
    isLoading: achievementsLoading || userAchievementsLoading || progressLoading,
  };
};

// Helper to get badge color classes
export const getBadgeColorClasses = (color: string) => {
  switch (color) {
    case "bronze":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "silver":
      return "bg-slate-100 text-slate-800 border-slate-300";
    case "gold":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "platinum":
      return "bg-purple-100 text-purple-800 border-purple-300";
    default:
      return "bg-muted text-muted-foreground";
  }
};

// Category display names
export const categoryDisplayNames: Record<string, string> = {
  general: "General",
  auditor: "Auditor",
  field_manager: "Field Manager",
  contractor: "Contractor",
  admin: "Administrator",
};
