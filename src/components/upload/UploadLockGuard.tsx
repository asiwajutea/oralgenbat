import { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUploadLockStatus, LockScope } from "@/hooks/useUploadLockStatus";

interface Props extends LockScope {
  children: ReactNode;
  showBanner?: boolean;
  className?: string;
}

/**
 * Wraps any upload trigger (button, dropdown trigger, etc.). When locked,
 * the wrapped subtree is visually dimmed and click events are intercepted.
 * A tooltip shows the lock reason; pass `showBanner` to also render an
 * inline amber banner.
 */
export const UploadLockGuard = ({ children, showBanner, className, ...scope }: Props) => {
  const { locked, reason } = useUploadLockStatus(scope);

  if (!locked) return <>{children}</>;

  const blockClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className={`inline-flex flex-col gap-2 ${className || ""}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-block opacity-60 cursor-not-allowed"
            onClickCapture={blockClick}
            onKeyDownCapture={blockClick}
            aria-disabled
            tabIndex={-1}
          >
            <span className="pointer-events-none inline-block">{children}</span>
          </span>
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