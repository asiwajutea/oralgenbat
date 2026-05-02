import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<string, string> = {
  failed_audit: "Failed Audits",
  tracking_comment: "Tracking Comments",
  announcement: "Announcements",
  push: "Push Notifications",
  direct: "Direct Messages",
  group: "Group Chats",
};

const DEFAULT_CATEGORIES = {
  failed_audit: true,
  tracking_comment: true,
  announcement: true,
  push: true,
  direct: true,
  group: true,
};

const ChatPreferences = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);
  const [categories, setCategories] = useState<Record<string, boolean>>(DEFAULT_CATEGORIES);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("chat_user_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setPushEnabled(data.push_enabled);
        setEmailDigest(data.email_digest);
        setCategories({ ...DEFAULT_CATEGORIES, ...((data.categories_enabled as any) || {}) });
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const save = async (next: { push_enabled?: boolean; email_digest?: boolean; categories_enabled?: any }) => {
    if (!user?.id) return;
    const payload = {
      user_id: user.id,
      push_enabled: next.push_enabled ?? pushEnabled,
      email_digest: next.email_digest ?? emailDigest,
      categories_enabled: next.categories_enabled ?? categories,
    };
    const { error } = await supabase.from("chat_user_preferences").upsert(payload, { onConflict: "user_id" });
    if (error) toast.error(error.message);
  };

  if (loading) return <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="font-medium">Push notifications for new messages</Label>
          <p className="text-xs text-muted-foreground">Receive a device push when a chat message arrives.</p>
        </div>
        <Switch checked={pushEnabled} onCheckedChange={(v) => { setPushEnabled(v); save({ push_enabled: v }); }} />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label className="font-medium">Daily email digest</Label>
          <p className="text-xs text-muted-foreground">Summary of unread inbox activity, sent once per day.</p>
        </div>
        <Switch checked={emailDigest} onCheckedChange={(v) => { setEmailDigest(v); save({ email_digest: v }); }} />
      </div>
      <div>
        <Label className="font-medium">Categories shown in inbox</Label>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between border rounded-md px-3 py-2">
              <span className="text-sm">{label}</span>
              <Switch
                checked={categories[key] ?? true}
                onCheckedChange={(v) => {
                  const next = { ...categories, [key]: v };
                  setCategories(next);
                  save({ categories_enabled: next });
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChatPreferences;