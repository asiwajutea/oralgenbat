import { Flame } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { BurnHistoryEntry } from "@/hooks/useBurnHistory";

export function BurnHistoryIcon({ entry, className = "" }: { entry?: BurnHistoryEntry; className?: string }) {
  if (!entry) return null;
  const color = entry.currently_burned ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400";
  const label = entry.currently_burned
    ? "Currently in burn queue"
    : `Previously burned${entry.restored_at ? ` — restored ${new Date(entry.restored_at).toLocaleDateString()}` : ""}`;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Flame className={`h-3.5 w-3.5 inline-block ${color} ${className}`} aria-label={label} />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}