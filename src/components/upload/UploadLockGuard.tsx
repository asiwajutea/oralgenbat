import { ReactNode, cloneElement, isValidElement } from "react";
import { Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUploadLockStatus, LockScope } from "@/hooks/useUploadLockStatus";

interface Props extends LockScope {
  children: ReactNode;
  showBanner?: boolean;
}

/**
 * Wraps an upload trigger. If uploads are locked for the resolved scope,
 * the child becomes disabled and a tooltip shows the lock reason.
 */
export const UploadLockGuard = ({ children, showBanner, ...scope }: Props) => {
  const { locked, reason } = useUploadLockStatus(scope);

  const child = isValidElement(children)
    ? cloneElement(children as any, locked ? {
        disabled: true,
        onClick: (e: React.MouseEvent) => e.preventDefault(),
      } : {})
    : children;

  if (!locked) return <>{child}</>;

  return (
    <div className="space-y-2 inline-block">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">{child}</span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-start gap-2 max-w-xs">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span className="text-xs">{reason}</span>
          </div>
        </TooltipContent>
      </Tooltip>
      {showBanner && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <Lock className="h-3.5 w-3.5" />
          <span><strong>Uploads locked:</strong> {reason}</span>
        </div>
      )}
    </div>
  );
};