import { useState, useEffect } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";

const PWA_INSTALL_DISMISSED_KEY = "pwa_install_prompt_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if (!user || !isInstallable) return;
    const isDismissed = localStorage.getItem(PWA_INSTALL_DISMISSED_KEY);
    if (isDismissed) return;

    // Delay showing prompt by 5 seconds after user is logged in
    const timer = setTimeout(() => setOpen(true), 5000);
    return () => clearTimeout(timer);
  }, [user, isInstallable]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setOpen(false);
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  const handleNeverAsk = () => {
    localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, "true");
    setOpen(false);
  };

  if (!user || !isInstallable) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-full bg-primary/10">
              <Smartphone className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle>Install App</DialogTitle>
          </div>
          <DialogDescription>
            Install the Audit Tool on your device for quick access, offline
            capabilities, and a native app experience.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>Works offline - access the app anytime</li>
            <li>Quick launch from your home screen</li>
            <li>Full-screen experience</li>
            <li>Faster loading times</li>
          </ul>

          <div className="flex flex-col gap-2">
            <Button onClick={handleInstall} className="w-full gap-2">
              <Download className="h-4 w-4" />
              Install App
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
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
