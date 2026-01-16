import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRegisterSW } from "virtual:pwa-register/react";

export function PWAUpdatePrompt() {
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Check for updates periodically (every 30 seconds)
      if (r) {
        setInterval(() => {
          r.update();
        }, 30 * 1000);
      }
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      setShowUpdateBanner(true);
    }
  }, [needRefresh]);

  const handleUpdate = async () => {
    await updateServiceWorker(true);
  };

  const handleDismiss = () => {
    setShowUpdateBanner(false);
    setNeedRefresh(false);
  };

  if (!showUpdateBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 bg-primary text-primary-foreground rounded-lg shadow-lg p-4 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3">
        <RefreshCw className="h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-medium text-sm">New version available!</p>
          <p className="text-xs opacity-90">Click update to get the latest features.</p>
        </div>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <Button size="sm" variant="secondary" onClick={handleDismiss} className="text-xs">
          Later
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleUpdate}
          className="text-xs bg-primary-foreground text-primary hover:bg-primary-foreground/90"
        >
          Update
        </Button>
      </div>
    </div>
  );
}
