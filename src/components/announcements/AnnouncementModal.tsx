import { useState } from "react";
import { X, Megaphone, AlertTriangle, CheckCircle, Info, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Announcement } from "@/hooks/useAnnouncements";

interface AnnouncementModalProps {
  announcement: Announcement;
  onDismiss: (acknowledged: boolean) => void;
}

const styleConfig = {
  info: {
    icon: Info,
    gradient: "from-blue-500 to-cyan-500",
    bgGradient: "from-blue-500/10 to-cyan-500/10",
    iconColor: "text-blue-500",
    borderColor: "border-blue-500/20",
  },
  warning: {
    icon: AlertTriangle,
    gradient: "from-amber-500 to-orange-500",
    bgGradient: "from-amber-500/10 to-orange-500/10",
    iconColor: "text-amber-500",
    borderColor: "border-amber-500/20",
  },
  success: {
    icon: CheckCircle,
    gradient: "from-emerald-500 to-green-500",
    bgGradient: "from-emerald-500/10 to-green-500/10",
    iconColor: "text-emerald-500",
    borderColor: "border-emerald-500/20",
  },
  announcement: {
    icon: Megaphone,
    gradient: "from-purple-500 to-pink-500",
    bgGradient: "from-purple-500/10 to-pink-500/10",
    iconColor: "text-purple-500",
    borderColor: "border-purple-500/20",
  },
};

export const AnnouncementModal = ({ announcement, onDismiss }: AnnouncementModalProps) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const config = styleConfig[announcement.style] || styleConfig.info;
  const Icon = config.icon;

  const handleDismiss = () => {
    if (announcement.require_acknowledgment && !acknowledged) {
      return;
    }
    onDismiss(acknowledged);
  };

  const handleCtaClick = () => {
    if (announcement.cta_url) {
      window.open(announcement.cta_url, "_blank", "noopener,noreferrer");
    }
    onDismiss(acknowledged);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => !announcement.require_acknowledgment && handleDismiss()}
      />
      
      {/* Modal */}
      <div 
        className={cn(
          "relative w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-2xl",
          "animate-in fade-in-0 zoom-in-95 duration-300",
          config.borderColor
        )}
      >
        {/* Gradient Header */}
        <div className={cn("h-2 bg-gradient-to-r", config.gradient)} />
        
        {/* Close Button */}
        {!announcement.require_acknowledgment && (
          <button
            onClick={handleDismiss}
            className="absolute right-3 top-5 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Content */}
        <div className={cn("p-6 bg-gradient-to-br", config.bgGradient)}>
          {/* Icon */}
          <div className={cn("mb-4 flex justify-center")}>
            <div className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full",
              "bg-gradient-to-br shadow-lg",
              config.gradient
            )}>
              <Icon className="h-7 w-7 text-white" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-center text-xl font-bold tracking-tight mb-3">
            {announcement.title}
          </h2>

          {/* Content - with text wrapping */}
          <div className="text-center text-muted-foreground mb-6 max-h-[200px] overflow-y-auto">
            <p className="whitespace-pre-wrap break-words leading-relaxed">
              {announcement.content}
            </p>
          </div>

          {/* Acknowledgment Checkbox */}
          {announcement.require_acknowledgment && (
            <div className="flex items-start gap-3 mb-6 p-3 rounded-lg bg-background/50">
              <Checkbox
                id="acknowledge"
                checked={acknowledged}
                onCheckedChange={(checked) => setAcknowledged(checked === true)}
                className="mt-0.5"
              />
              <Label 
                htmlFor="acknowledge" 
                className="text-sm text-muted-foreground cursor-pointer leading-relaxed"
              >
                I have read and acknowledged this announcement
              </Label>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {announcement.cta_text && announcement.cta_url && (
              <Button 
                onClick={handleCtaClick}
                className={cn("w-full bg-gradient-to-r text-white shadow-lg", config.gradient)}
                disabled={announcement.require_acknowledgment && !acknowledged}
              >
                {announcement.cta_text}
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            )}
            
            <Button
              variant="outline"
              onClick={handleDismiss}
              disabled={announcement.require_acknowledgment && !acknowledged}
              className="w-full"
            >
              {announcement.cta_text ? "Dismiss" : "Got it"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
