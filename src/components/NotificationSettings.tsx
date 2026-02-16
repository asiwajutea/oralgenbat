import { Bell, BellOff, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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

  const ToggleRow = ({ id, label, description, checked }: { id: string; label: string; description: string; checked: boolean }) => (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(val) => handleToggle(id, val)}
      />
    </div>
  );

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
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <Check className="h-3 w-3 mr-1" />
                Enabled
              </Badge>
            </div>
          ) : permissionStatus === "denied" ? (
            <div className="space-y-2">
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                <BellOff className="h-3 w-3 mr-1" />
                Blocked
              </Badge>
              <p className="text-xs text-muted-foreground">
                To re-enable: click the lock/info icon in your browser's address bar → Site settings → Notifications → Allow, then refresh the page.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  localStorage.removeItem("push_notification_prompt_dismissed");
                  toast.success("Prompt reset! You'll see the notification prompt on your next visit.");
                }}
              >
                Reset Prompt
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button onClick={handleRequestPermission} size="sm">
                Enable
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  localStorage.removeItem("push_notification_prompt_dismissed");
                  toast.success("Prompt reset! You'll see the notification prompt on your next visit.");
                }}
              >
                Reset Prompt
              </Button>
            </div>
          )}
        </div>

        {/* Audit Notifications */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Audit Notifications</h4>
          <ToggleRow id="notify_audit_passed" label="Audit Passed" description="Notify when interviews pass audit" checked={settings?.notify_audit_passed ?? true} />
          <ToggleRow id="notify_failed_audit" label="Failed Audits" description="Notify when team interviews fail audit" checked={settings?.notify_failed_audit ?? true} />
          <ToggleRow id="notify_re_audit" label="Re-Audit Requests" description="Notify when interviews are sent for re-audit" checked={settings?.notify_re_audit ?? true} />
          <ToggleRow id="notify_new_interviews" label="New Interviews" description="Notify when new interviews are uploaded" checked={settings?.notify_new_interviews ?? true} />
        </div>

        <Separator />

        {/* Team Notifications */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Team Notifications</h4>
          <ToggleRow id="notify_team_requests" label="Team Requests" description="Notify on team assignment requests, approvals, and rejections" checked={settings?.notify_team_requests ?? true} />
          <ToggleRow id="notify_agent_reassigned" label="Agent Reassigned" description="Notify when interviewers are reassigned between field managers" checked={settings?.notify_agent_reassigned ?? true} />
          <ToggleRow id="notify_interview_assigned" label="Interview Assigned" description="Notify when interviews are assigned to data entry teams" checked={settings?.notify_interview_assigned ?? true} />
        </div>

        <Separator />

        {/* Account Notifications */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Account Notifications</h4>
          <ToggleRow id="notify_account_status" label="Account Status" description="Notify on account approval or suspension" checked={settings?.notify_account_status ?? true} />
          <ToggleRow id="notify_new_registration" label="New Registrations" description="Notify when new users register and await approval" checked={settings?.notify_new_registration ?? true} />
        </div>

        <Separator />

        {/* Other Notifications */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Other Notifications</h4>
          <ToggleRow id="notify_payment" label="Payments" description="Notify on payment records and booklet journey updates" checked={settings?.notify_payment ?? true} />
          <ToggleRow id="notify_data_entry_complete" label="Data Entry Complete" description="Notify when data entry is completed for interviews" checked={settings?.notify_data_entry_complete ?? true} />
          <ToggleRow id="notify_issues" label="Issues" description="Notify on flagged issues and resolutions" checked={settings?.notify_issues ?? true} />
          <ToggleRow id="notify_comments" label="Comments" description="Notify on comment replies and resolution comments" checked={settings?.notify_comments ?? true} />
          <ToggleRow id="notify_milestones" label="Achievements" description="Notify when you earn new achievements" checked={settings?.notify_milestones ?? true} />
          <ToggleRow id="notify_inactivity" label="Inactivity Reminders" description="Remind me after extended inactivity" checked={settings?.notify_inactivity ?? true} />
        </div>
      </CardContent>
    </Card>
  );
};

export default NotificationSettings;
