import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useUpsertBudgetTarget, BudgetTarget } from "@/hooks/usePaymentTracking";

interface SetBudgetTargetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractorId: string;
  currentTarget: BudgetTarget | null;
}

export const SetBudgetTargetDialog = ({
  open,
  onOpenChange,
  contractorId,
  currentTarget,
}: SetBudgetTargetDialogProps) => {
  const [targetNames, setTargetNames] = useState("");
  const [label, setLabel] = useState("");
  const upsert = useUpsertBudgetTarget();

  useEffect(() => {
    if (open) {
      setTargetNames(currentTarget?.target_names?.toString() || "");
      setLabel(currentTarget?.label || "");
    }
  }, [open, currentTarget]);

  const handleSubmit = () => {
    const value = parseInt(targetNames);
    if (!value || value <= 0) return;

    upsert.mutate(
      { contractorId, targetNames: value, label: label || undefined },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Budget Target</DialogTitle>
          <DialogDescription>
            Define the total names target for this contractor to track progress.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="target-names">Target (Total Names)</Label>
            <Input
              id="target-names"
              type="number"
              min="1"
              placeholder="e.g. 200000"
              value={targetNames}
              onChange={(e) => setTargetNames(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-label">Label (optional)</Label>
            <Input
              id="target-label"
              placeholder="e.g. Q2 2026 Target"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!targetNames || parseInt(targetNames) <= 0 || upsert.isPending}
          >
            {upsert.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Target"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
