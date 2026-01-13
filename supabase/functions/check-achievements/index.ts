import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AchievementCheck {
  user_id: string;
  action_type: string; // 'review', 'upload', 'login', 'approval', etc.
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { user_id, action_type }: AchievementCheck = await req.json();

    if (!user_id) {
      throw new Error("user_id is required");
    }

    // Get user's role
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id);

    const role = userRoles?.[0]?.role || "user";

    // Get all achievements the user hasn't earned yet
    const { data: earnedAchievements } = await supabase
      .from("user_achievements")
      .select("achievement_id")
      .eq("user_id", user_id);

    const earnedIds = new Set(earnedAchievements?.map(a => a.achievement_id) || []);

    // Get relevant achievements based on user's role
    const roleCategories = ["general"];
    if (role === "auditor") roleCategories.push("auditor");
    if (role === "field_manager") roleCategories.push("field_manager");
    if (role === "contractor") roleCategories.push("contractor");
    if (role === "admin" || role === "super_admin") {
      roleCategories.push("admin", "auditor");
    }

    const { data: achievements } = await supabase
      .from("achievements")
      .select("*")
      .in("category", roleCategories);

    const unearnedAchievements = (achievements || []).filter(
      a => !earnedIds.has(a.id)
    );

    const newlyEarnedAchievements: any[] = [];

    // Check each unearned achievement
    for (const achievement of unearnedAchievements) {
      let currentValue = 0;
      let qualified = false;

      switch (achievement.criteria_field) {
        case "reviews":
          // Count completed reviews
          const { count: reviewCount } = await supabase
            .from("audits")
            .select("*", { count: "exact", head: true })
            .not("reviewed_at", "is", null)
            .or(`reviewed_by.eq.${user_id}`);
          
          // Also try by name
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user_id)
            .single();
          
          if (profile?.full_name) {
            const { count: reviewByNameCount } = await supabase
              .from("audits")
              .select("*", { count: "exact", head: true })
              .not("reviewed_at", "is", null)
              .eq("reviewed_by", profile.full_name);
            currentValue = reviewByNameCount || 0;
          } else {
            currentValue = reviewCount || 0;
          }
          qualified = currentValue >= achievement.criteria_value;
          break;

        case "team_size":
          // Count team members for field managers
          const { count: teamCount } = await supabase
            .from("team_assignments")
            .select("*", { count: "exact", head: true })
            .eq("field_manager_id", user_id)
            .eq("status", "approved");
          currentValue = teamCount || 0;
          qualified = currentValue >= achievement.criteria_value;
          break;

        case "total_interviews":
          // Count interviews for contractors
          const { data: contractorProfile } = await supabase
            .from("profiles")
            .select("contractor_id, active_contractor_id")
            .eq("id", user_id)
            .single();
          
          const contractorId = contractorProfile?.active_contractor_id || contractorProfile?.contractor_id;
          if (contractorId) {
            const { count: interviewCount } = await supabase
              .from("interview_metadata")
              .select("*", { count: "exact", head: true })
              .eq("contractor_id", contractorId);
            currentValue = interviewCount || 0;
          }
          qualified = currentValue >= achievement.criteria_value;
          break;

        case "approvals":
          // Count user approvals for admins
          const { count: approvalCount } = await supabase
            .from("admin_notifications")
            .select("*", { count: "exact", head: true })
            .eq("resolved", true);
          currentValue = approvalCount || 0;
          qualified = currentValue >= achievement.criteria_value;
          break;

        case "login_streak":
          // Check login streak from user_presence
          const { data: presence } = await supabase
            .from("user_presence")
            .select("*")
            .eq("user_id", user_id)
            .single();
          
          // For now, use a simple approach - count consecutive days
          // This would need to be enhanced with proper streak tracking
          currentValue = 1; // Placeholder
          qualified = currentValue >= achievement.criteria_value;
          break;

        case "actions":
          // First action achievement
          currentValue = 1;
          qualified = true;
          break;

        default:
          // Skip unknown criteria
          continue;
      }

      // Update progress
      await supabase
        .from("user_achievement_progress")
        .upsert({
          user_id,
          achievement_id: achievement.id,
          current_value: currentValue,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,achievement_id" });

      // Award achievement if qualified
      if (qualified) {
        const { error: awardError } = await supabase
          .from("user_achievements")
          .insert({
            user_id,
            achievement_id: achievement.id,
            progress_value: currentValue,
          });

        if (!awardError) {
          newlyEarnedAchievements.push(achievement);

          // Create notification for earning achievement
          await supabase
            .from("user_notifications")
            .insert({
              user_id,
              type: "milestone",
              title: `Achievement Unlocked! 🏆`,
              message: `You've earned the "${achievement.name}" badge - ${achievement.description}`,
              metadata: {
                achievement_id: achievement.id,
                achievement_code: achievement.code,
                badge_color: achievement.badge_color,
              },
            });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        newly_earned: newlyEarnedAchievements.length,
        achievements: newlyEarnedAchievements.map(a => ({
          code: a.code,
          name: a.name,
        })),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error in check-achievements function:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
