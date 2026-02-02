import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Printer, Package, Truck, Loader2 } from "lucide-react";
import { useUpdateJourneyStatus } from "@/hooks/usePaymentTracking";
import { toast } from "sonner";

interface BulkJourneyUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRecords: Array<{
    id: string;
    file_name: string;
    payment?: {
      id: string;
    } | null;
  }>;
  onComplete: () => void;
}

const JOURNEY_STAGES = [
  { id: "booklet_printed_at", label: "Booklet Printed", icon: Printer },
  { id: "booklet_received_at", label: "Booklet Received", icon: Package },
  { id: "booklet_delivered_at", label: "Booklet Delivered", icon: Truck },
] as const;

type JourneyField = typeof JOURNEY_STAGES[number]["id"];

export const BulkJourneyUpdateDialog = ({
  open,
  onOpenChange,
  selectedRecords,
  onComplete,
}: BulkJourneyUpdateDialogProps) => {
  const [selectedStage, setSelectedStage] = useState<JourneyField | "">("");
  const [isUpdating, setIsUpdating] = useState(false);
  const updateJourney = useUpdateJourneyStatus();

  // Filter records that have payment records (required for journey update)
  const recordsWithPayment = selectedRecords.filter(r => r.payment?.id);
  const recordsWithoutPayment = selectedRecords.filter(r => !r.payment?.id);

  const handleUpdate = async () => {
    if (!selectedStage || recordsWithPayment.length === 0) return;

    setIsUpdating(true);
    const now = new Date().toISOString();
    let successCount = 0;
    let failCount = 0;

    for (const record of recordsWithPayment) {
      if (!record.payment?.id) continue;
      
      try {
        await updateJourney.mutateAsync({
          recordId: record.payment.id,
          field: selectedStage,
          value: now,
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to update ${record.file_name}:`, error);
        failCount++;
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
    setSelectedStage("");
  };

  const handleClear = async () => {
    if (!selectedStage || recordsWithPayment.length === 0) return;

    setIsUpdating(true);
    let successCount = 0;
    let failCount = 0;

    for (const record of recordsWithPayment) {
      if (!record.payment?.id) continue;
      
      try {
        await updateJourney.mutateAsync({
          recordId: record.payment.id,
          field: selectedStage,
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
    setSelectedStage("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Journey Status</DialogTitle>
          <DialogDescription>
            Update the journey stage for {selectedRecords.length} selected interview(s).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {recordsWithoutPayment.length > 0 && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
              <strong>{recordsWithoutPayment.length}</strong> interview(s) don't have payment records yet and will be skipped.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="stage">Select Journey Stage</Label>
            <Select value={selectedStage} onValueChange={(v) => setSelectedStage(v as JourneyField)}>
              <SelectTrigger id="stage">
                <SelectValue placeholder="Choose a stage to update..." />
              </SelectTrigger>
              <SelectContent>
                {JOURNEY_STAGES.map((stage) => {
                  const Icon = stage.icon;
                  return (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {stage.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedStage && (
            <p className="text-sm text-muted-foreground">
              This will mark <strong>{recordsWithPayment.length}</strong> interview(s) as "{JOURNEY_STAGES.find(s => s.id === selectedStage)?.label}".
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            Cancel
          </Button>
          <Button 
            variant="secondary" 
            onClick={handleClear} 
            disabled={!selectedStage || recordsWithPayment.length === 0 || isUpdating}
          >
            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Clear Stage
          </Button>
          <Button 
            onClick={handleUpdate} 
            disabled={!selectedStage || recordsWithPayment.length === 0 || isUpdating}
          >
            {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Mark Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
