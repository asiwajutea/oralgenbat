import { Bell, BellOff, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/hooks/useNotifications";
import { toast } from "sonner";

const NotificationSettings = () => {
  const { 
    settings, 
    permissionStatus, 
    updateSettings, 
    requestPermission,
    settingsLoading 
  } = useNotifications();

  const handleRequestPermission = async () => {
    const granted = await requestPermission();
    if (granted) {
      toast.success("Push notifications enabled!");
    } else {
      toast.error("Push notifications were denied. Please enable them in your browser settings.");
    }
  };

  const handleToggle = (key: string, value: boolean) => {
    updateSettings({ [key]: value } as any);
    toast.success("Settings updated");
  };

  if (settingsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Settings
        </CardTitle>
        <CardDescription>
          Configure which notifications you want to receive
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Push Notification Permission */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-1">
            <Label className="text-base">Push Notifications</Label>
            <p className="text-sm text-muted-foreground">
              Receive browser notifications when you're not on the app
            </p>
          </div>
          {permissionStatus === "granted" ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Check className="h-3 w-3 mr-1" />
              Enabled
            </Badge>
          ) : permissionStatus === "denied" ? (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              <BellOff className="h-3 w-3 mr-1" />
              Blocked
            </Badge>
          ) : (
            <Button onClick={handleRequestPermission} size="sm">
              Enable
            </Button>
          )}
        </div>

        {/* Notification Type Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="notify_inactivity">Inactivity Reminders</Label>
              <p className="text-sm text-muted-foreground">
                Remind me to come online after 12 hours of inactivity
              </p>
            </div>
            <Switch
              id="notify_inactivity"
              checked={settings?.notify_inactivity ?? true}
              onCheckedChange={(checked) => handleToggle("notify_inactivity", checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="notify_new_interviews">New Interviews</Label>
              <p className="text-sm text-muted-foreground">
                Notify me when new interviews are uploaded
              </p>
            </div>
            <Switch
              id="notify_new_interviews"
              checked={settings?.notify_new_interviews ?? true}
              onCheckedChange={(checked) => handleToggle("notify_new_interviews", checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="notify_re_audit">Re-Audit Requests</Label>
              <p className="text-sm text-muted-foreground">
                Notify me when interviews I reviewed are sent for re-audit
              </p>
            </div>
            <Switch
              id="notify_re_audit"
              checked={settings?.notify_re_audit ?? true}
              onCheckedChange={(checked) => handleToggle("notify_re_audit", checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="notify_failed_audit">Failed Audits</Label>
              <p className="text-sm text-muted-foreground">
                Notify me when my team's interviews fail audit
              </p>
            </div>
            <Switch
              id="notify_failed_audit"
              checked={settings?.notify_failed_audit ?? true}
              onCheckedChange={(checked) => handleToggle("notify_failed_audit", checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="notify_milestones">Achievements</Label>
              <p className="text-sm text-muted-foreground">
                Notify me when I earn new achievements
              </p>
            </div>
            <Switch
              id="notify_milestones"
              checked={settings?.notify_milestones ?? true}
              onCheckedChange={(checked) => handleToggle("notify_milestones", checked)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NotificationSettings;
