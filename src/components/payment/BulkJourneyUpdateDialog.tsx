import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Printer, Package, Truck, Loader2, DollarSign, RotateCcw } from "lucide-react";
import { useUpdateJourneyStatus, useCreateOrUpdatePaymentStatus } from "@/hooks/usePaymentTracking";
import { toast } from "sonner";

interface BulkJourneyUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRecords: Array<{
    id: string;
    file_name: string;
    total_names: number | null;
    contractor_id: string | null;
    payment?: {
      id: string;
    } | null;
  }>;
  onComplete: () => void;
}

const PAYMENT_STATUS_OPTIONS = [
  { id: "payment_received", label: "Mark as Payment Received", icon: DollarSign, type: "new_payment" as const },
  { id: "payment_revoked", label: "Mark as Payment Revoked (Rework)", icon: RotateCcw, type: "deduction" as const },
];

const JOURNEY_STAGES = [
  { id: "booklet_printed_at", label: "Booklet Printed", icon: Printer },
  { id: "booklet_received_at", label: "Booklet Received", icon: Package },
  { id: "booklet_delivered_at", label: "Booklet Delivered", icon: Truck },
] as const;

type JourneyField = typeof JOURNEY_STAGES[number]["id"];
type ActionType = "payment_received" | "payment_revoked" | JourneyField;

export const BulkJourneyUpdateDialog = ({
  open,
  onOpenChange,
  selectedRecords,
  onComplete,
}: BulkJourneyUpdateDialogProps) => {
  const [selectedAction, setSelectedAction] = useState<ActionType | "">("");
  const [isUpdating, setIsUpdating] = useState(false);
  const updateJourney = useUpdateJourneyStatus();
  const createOrUpdatePayment = useCreateOrUpdatePaymentStatus();

  // Filter records for journey updates (need existing payment records)
  const recordsWithPayment = selectedRecords.filter(r => r.payment?.id);
  const recordsWithoutPayment = selectedRecords.filter(r => !r.payment?.id);

  const isPaymentAction = selectedAction === "payment_received" || selectedAction === "payment_revoked";
  const isJourneyAction = JOURNEY_STAGES.some(s => s.id === selectedAction);

  const getActionLabel = () => {
    if (selectedAction === "payment_received") return "Payment Received";
    if (selectedAction === "payment_revoked") return "Payment Revoked (Rework)";
    return JOURNEY_STAGES.find(s => s.id === selectedAction)?.label || "";
  };

  const handleUpdate = async () => {
    if (!selectedAction) return;

    setIsUpdating(true);
    let successCount = 0;
    let failCount = 0;

    if (isPaymentAction) {
      // Handle payment status updates (works on all selected records)
      const paymentType = selectedAction === "payment_received" ? "new_payment" : "deduction";
      
      for (const record of selectedRecords) {
        try {
          await createOrUpdatePayment.mutateAsync({
            auditId: record.id,
            folderName: record.file_name,
            paymentType,
            namesCount: record.total_names || 0,
            contractorId: record.contractor_id || undefined,
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to update ${record.file_name}:`, error);
          failCount++;
        }
      }
    } else if (isJourneyAction) {
      // Handle journey stage updates (only works on records with payment)
      const now = new Date().toISOString();
      
      for (const record of recordsWithPayment) {
        if (!record.payment?.id) continue;
        
        try {
          await updateJourney.mutateAsync({
            recordId: record.payment.id,
            field: selectedAction as JourneyField,
            value: now,
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to update ${record.file_name}:`, error);
          failCount++;
        }
      }
    }

    setIsUpdating(false);

    if (successCount > 0) {
      toast.success(`Updated ${successCount} record(s) successfully`);
    }
    if (failCount > 0) {
      toast.error(`Failed to update ${failCount} record(s)`);
    }

    onComplete();
    onOpenChange(false);
    setSelectedAction("");
  };

  const handleClear = async () => {
    if (!selectedAction || !isJourneyAction || recordsWithPayment.length === 0) return;

    setIsUpdating(true);
    let successCount = 0;
    let failCount = 0;

    for (const record of recordsWithPayment) {
      if (!record.payment?.id) continue;
      
      try {
        await updateJourney.mutateAsync({
          recordId: record.payment.id,
          field: selectedAction as JourneyField,
          value: null,
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to clear ${record.file_name}:`, error);
        failCount++;
      }
    }

    setIsUpdating(false);

    if (successCount > 0) {
      toast.success(`Cleared ${successCount} record(s) successfully`);
    }
    if (failCount > 0) {
      toast.error(`Failed to clear ${failCount} record(s)`);
    }

    onComplete();
    onOpenChange(false);
    setSelectedAction("");
  };

  const getAffectedCount = () => {
    if (isPaymentAction) return selectedRecords.length;
    if (isJourneyAction) return recordsWithPayment.length;
    return 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Selected Interviews</DialogTitle>
          <DialogDescription>
            Update payment status or journey stage for {selectedRecords.length} selected interview(s).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Payment Status Options */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Payment Status</Label>
            <RadioGroup value={selectedAction} onValueChange={(v) => setSelectedAction(v as ActionType)}>
              {PAYMENT_STATUS_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <div key={option.id} className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50">
                    <RadioGroupItem value={option.id} id={option.id} />
                    <Label htmlFor={option.id} className="flex items-center gap-2 cursor-pointer flex-1">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{option.label}</span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          <Separator />

          {/* Journey Stage Options */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Booklet Journey</Label>
            {recordsWithoutPayment.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Note: {recordsWithoutPayment.length} interview(s) without payment records will be skipped for journey updates.
              </p>
            )}
            <RadioGroup value={selectedAction} onValueChange={(v) => setSelectedAction(v as ActionType)}>
              {JOURNEY_STAGES.map((stage) => {
                const Icon = stage.icon;
                return (
                  <div key={stage.id} className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50">
                    <RadioGroupItem value={stage.id} id={stage.id} />
                    <Label htmlFor={stage.id} className="flex items-center gap-2 cursor-pointer flex-1">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{stage.label}</span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          {selectedAction && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              This will mark <strong>{getAffectedCount()}</strong> interview(s) as "{getActionLabel()}".
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            Cancel
          </Button>
          {isJourneyAction && (
            <Button 
              variant="secondary" 
              onClick={handleClear} 
              disabled={!selectedAction || recordsWithPayment.length === 0 || isUpdating}
            >
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Clear Stage
            </Button>
          )}
          <Button 
            onClick={handleUpdate} 
            disabled={!selectedAction || getAffectedCount() === 0 || isUpdating}
          >
            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isPaymentAction ? "Update Status" : "Mark Complete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
