import { Check, FileText, Shield, Keyboard, DollarSign, Printer, Package, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";

export interface JourneyStep {
  id: string;
  label: string;
  icon: React.ElementType;
  completed: boolean;
  completedAt?: string | null;
  current?: boolean;
}

interface InterviewJourneyTrackerProps {
  steps: JourneyStep[];
  compact?: boolean;
}

export const InterviewJourneyTracker = ({ steps, compact = false }: InterviewJourneyTrackerProps) => {
  const currentStepIndex = steps.findIndex(step => step.current) ?? steps.findIndex(step => !step.completed);
  
  return (
    <div className={cn(
      "flex items-center w-full",
      compact ? "gap-1" : "gap-2"
    )}>
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isCompleted = step.completed;
        const isCurrent = step.current || (index === currentStepIndex && !step.completed);
        const isPending = !isCompleted && !isCurrent;
        
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex items-center justify-center rounded-full border-2 transition-all duration-300",
                      compact ? "h-6 w-6" : "h-8 w-8 sm:h-10 sm:w-10",
                      isCompleted && "bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/30",
                      isCurrent && "bg-primary border-primary text-primary-foreground animate-pulse shadow-md shadow-primary/30",
                      isPending && "bg-muted border-muted-foreground/30 text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <Check className={cn(compact ? "h-3 w-3" : "h-4 w-4 sm:h-5 sm:w-5")} />
                    ) : (
                      <Icon className={cn(compact ? "h-3 w-3" : "h-4 w-4 sm:h-5 sm:w-5")} />
                    )}
                  </div>
                  {!compact && (
                    <span className={cn(
                      "text-[10px] sm:text-xs mt-1 text-center max-w-[60px] sm:max-w-[80px] leading-tight font-medium",
                      isCompleted && "text-emerald-600 dark:text-emerald-400",
                      isCurrent && "text-primary",
                      isPending && "text-muted-foreground"
                    )}>
                      {step.label}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px]">
                <p className="font-medium">{step.label}</p>
                {step.completedAt && (
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(step.completedAt), "MMM d, yyyy")}
                  </p>
                )}
                {isPending && <p className="text-xs text-muted-foreground">Pending</p>}
                {isCurrent && <p className="text-xs text-primary">In Progress</p>}
              </TooltipContent>
            </Tooltip>
            
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 mx-1",
                compact ? "min-w-[8px]" : "min-w-[12px] sm:min-w-[20px]",
                steps[index + 1]?.completed || (index < currentStepIndex)
                  ? "bg-emerald-500"
                  : isCurrent
                    ? "bg-gradient-to-r from-primary to-muted-foreground/30"
                    : "bg-muted-foreground/30"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
};

// Helper function to create journey steps from interview data
export const createJourneySteps = (data: {
  auditExists?: boolean;
  auditPassedAt?: string | null;
  assignedAt?: string | null;
  paymentReceivedAt?: string | null;
  bookletPrintedAt?: string | null;
  bookletReceivedAt?: string | null;
  bookletDeliveredAt?: string | null;
}): JourneyStep[] => {
  const steps: JourneyStep[] = [
    {
      id: "submitted",
      label: "Submitted",
      icon: FileText,
      completed: !!data.auditExists,
      completedAt: null,
    },
    {
      id: "bac_passed",
      label: "BAC Passed",
      icon: Shield,
      completed: !!data.auditPassedAt,
      completedAt: data.auditPassedAt,
    },
    {
      id: "transcribed",
      label: "Transcribed",
      icon: Keyboard,
      completed: !!data.assignedAt,
      completedAt: data.assignedAt,
    },
    {
      id: "payment_received",
      label: "Payment",
      icon: DollarSign,
      completed: !!data.paymentReceivedAt,
      completedAt: data.paymentReceivedAt,
    },
    {
      id: "booklet_printed",
      label: "Printed",
      icon: Printer,
      completed: !!data.bookletPrintedAt,
      completedAt: data.bookletPrintedAt,
    },
    {
      id: "booklet_received",
      label: "Received",
      icon: Package,
      completed: !!data.bookletReceivedAt,
      completedAt: data.bookletReceivedAt,
    },
    {
      id: "booklet_delivered",
      label: "Delivered",
      icon: Truck,
      completed: !!data.bookletDeliveredAt,
      completedAt: data.bookletDeliveredAt,
    },
  ];

  // Mark the current step
  const firstIncomplete = steps.findIndex(s => !s.completed);
  if (firstIncomplete >= 0) {
    steps[firstIncomplete].current = true;
  }

  return steps;
};

export default InterviewJourneyTracker;
