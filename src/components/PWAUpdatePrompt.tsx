import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRegisterSW } from "virtual:pwa-register/react";

export function ForcedPWAUpdatePrompt() {
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_, registration) {
      if (!registration) return;

      // 🔁 Check for updates every 15 seconds
      intervalRef.current = window.setInterval(() => {
        registration.update();
      }, 15_000);
    },

    onRegisterError(error) {
      console.error("Service Worker registration failed:", error);
    },
  });

  // Show banner when update is ready
  useEffect(() => {
    if (needRefresh) {
      setShowUpdateBanner(true);
    }
  }, [needRefresh]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleUpdate = async () => {
    // 🔥 Force activation + reload
    await updateServiceWorker(true);
  };

  // ❌ Cannot be dismissed
  if (!showUpdateBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground shadow-lg">
      <div className="mx-auto max-w-4xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <div>
            <p className="font-semibold text-sm">A new version is available</p>
            <p className="text-xs opacity-90">You must update to continue using the app.</p>
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleUpdate}
          className="bg-destructive-foreground text-destructive hover:bg-destructive-foreground/90"
        >
          Update Now
        </Button>
      </div>
    </div>
  );
}
