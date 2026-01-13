import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
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

    // Find users who haven't been active in over 12 hours
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    
    // Get users with notification settings that allow inactivity reminders
    const { data: inactiveUsers, error: inactiveError } = await supabase
      .from("user_presence")
      .select(`
        user_id,
        last_seen_at,
        profiles!inner (
          full_name,
          is_approved
        )
      `)
      .lt("last_seen_at", twelveHoursAgo)
      .eq("is_online", false);

    if (inactiveError) {
      console.error("Error fetching inactive users:", inactiveError);
      throw inactiveError;
    }

    console.log(`Found ${inactiveUsers?.length || 0} inactive users`);

    // Get users who have inactivity notifications enabled
    const { data: notificationSettings } = await supabase
      .from("user_notification_settings")
      .select("user_id")
      .eq("notify_inactivity", true);

    const usersWithNotificationsEnabled = new Set(
      notificationSettings?.map(s => s.user_id) || []
    );

    // Check which users we've already notified recently (within last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentNotifications } = await supabase
      .from("user_notifications")
      .select("user_id")
      .eq("type", "inactivity")
      .gte("created_at", oneDayAgo);

    const recentlyNotifiedUsers = new Set(
      recentNotifications?.map(n => n.user_id) || []
    );

    // Filter to only notify approved users who haven't been notified recently
    const usersToNotify = (inactiveUsers || []).filter(user => {
      const profile = user.profiles as any;
      const isApproved = profile?.is_approved === true;
      const hasNotificationsEnabled = usersWithNotificationsEnabled.size === 0 || 
        usersWithNotificationsEnabled.has(user.user_id);
      const notRecentlyNotified = !recentlyNotifiedUsers.has(user.user_id);
      
      return isApproved && hasNotificationsEnabled && notRecentlyNotified;
    });

    console.log(`Sending notifications to ${usersToNotify.length} users`);

    // Create notifications for inactive users
    if (usersToNotify.length > 0) {
      const notifications = usersToNotify.map(user => ({
        user_id: user.user_id,
        type: "inactivity",
        title: "We miss you! 👋",
        message: "You haven't been active in over 12 hours. Come back and check for new interviews!",
        metadata: {
          last_seen_at: user.last_seen_at,
        },
      }));

      const { error: insertError } = await supabase
        .from("user_notifications")
        .insert(notifications);

      if (insertError) {
        console.error("Error inserting notifications:", insertError);
        throw insertError;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notified: usersToNotify.length,
        skipped: (inactiveUsers?.length || 0) - usersToNotify.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error in check-inactivity function:", error);
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
