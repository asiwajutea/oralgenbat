import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";

const PROMPT_DISMISSED_KEY = "push_notification_prompt_dismissed";

export function PushNotificationPrompt() {
  const { user } = useAuth();
  const { requestPermission, settings } = useNotifications();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Only show prompt if:
    // 1. User is logged in
    // 2. Browser supports notifications
    // 3. User hasn't dismissed the prompt before
    // 4. Notification permission is not already granted or denied
    if (!user) return;
    
    const isDismissed = localStorage.getItem(PROMPT_DISMISSED_KEY);
    if (isDismissed) return;

    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;

    // Show prompt after a short delay
    const timer = setTimeout(() => {
      setOpen(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, [user]);

  const handleEnable = async () => {
    await requestPermission();
    setOpen(false);
  };

  const handleDismiss = () => {
    setOpen(false);
  };

  const handleNeverAsk = () => {
    localStorage.setItem(PROMPT_DISMISSED_KEY, "true");
    setOpen(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-full bg-primary/10">
              <Bell className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle>Enable Notifications</DialogTitle>
          </div>
          <DialogDescription>
            Stay updated with real-time notifications about interview status changes, 
            failed audits, re-audit submissions, and achievement milestones.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>You'll receive notifications for:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Failed audit alerts</li>
              <li>Re-audit submissions</li>
              <li>New interview uploads</li>
              <li>Issue flags and resolutions</li>
              <li>Achievement milestones</li>
            </ul>
          </div>
          
          <div className="flex flex-col gap-2">
            <Button onClick={handleEnable} className="w-full gap-2">
              <Bell className="h-4 w-4" />
              Enable Notifications
            </Button>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleDismiss}
                className="flex-1"
              >
                Not Now
              </Button>
              <Button 
                variant="ghost" 
                onClick={handleNeverAsk}
                className="flex-1 text-muted-foreground"
              >
                Don't Ask Again
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
