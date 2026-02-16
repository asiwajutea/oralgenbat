import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useCleanableAudits, useDeleteAuditFiles } from "@/hooks/useCleanupAudits";
import { Trash2, AlertTriangle, CheckCircle2, Package, Images } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface StorageCleanupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUsageMb: number;
}

export const StorageCleanupDialog = ({ open, onOpenChange, currentUsageMb }: StorageCleanupDialogProps) => {
  const [minAgeDays, setMinAgeDays] = useState(1);
  const [contractorFilter, setContractorFilter] = useState("");
  const [selectedAudits, setSelectedAudits] = useState<Set<string>>(new Set());
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [deleteZips, setDeleteZips] = useState(true);
  const [deletePhotos, setDeletePhotos] = useState(true);

  const { data: cleanableAudits, isLoading } = useCleanableAudits(minAgeDays, contractorFilter);
  const deleteMutation = useDeleteAuditFiles();

  const estimatedSavingsMb = useMemo(() => {
    if (!cleanableAudits) return 0;
    const selected = cleanableAudits.filter(a => selectedAudits.has(a.audit_id));
    // Rough estimate: 5MB per ZIP, 100KB per photo
    const zipSavings = deleteZips ? selected.length * 5 : 0;
    const photoSavings = deletePhotos ? selected.reduce((sum, a) => sum + (a.photo_count * 0.1), 0) : 0;
    return zipSavings + photoSavings;
  }, [cleanableAudits, selectedAudits, deleteZips, deletePhotos]);

  const selectedCount = selectedAudits.size;
  const selectedPhotosCount = useMemo(() => {
    if (!cleanableAudits) return 0;
    return cleanableAudits
      .filter(a => selectedAudits.has(a.audit_id))
      .reduce((sum, a) => sum + a.photo_count, 0);
  }, [cleanableAudits, selectedAudits]);

  const handleSelectAll = (checked: boolean) => {
    if (checked && cleanableAudits) {
      setSelectedAudits(new Set(cleanableAudits.map(a => a.audit_id)));
    } else {
      setSelectedAudits(new Set());
    }
  };

  const handleSelectAudit = (auditId: string, checked: boolean) => {
    const newSelected = new Set(selectedAudits);
    if (checked) {
      newSelected.add(auditId);
    } else {
      newSelected.delete(auditId);
    }
    setSelectedAudits(newSelected);
  };

  const handleDeleteClick = () => {
    if (selectedAudits.size === 0) return;
    setShowConfirmation(true);
  };

  const handleConfirmDelete = async () => {
    if (confirmationText !== "DELETE") return;

    await deleteMutation.mutateAsync({
      auditIds: Array.from(selectedAudits),
      deleteZips,
      deletePhotos
    });

    // Reset state
    setSelectedAudits(new Set());
    setShowConfirmation(false);
    setConfirmationText("");
    onOpenChange(false);
  };

  const handleCancel = () => {
    setShowConfirmation(false);
    setConfirmationText("");
  };

  if (showConfirmation) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. Please review carefully.
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive" className="my-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">You are about to delete:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  {deleteZips && <li>{selectedCount} mobile ZIP files (~{Math.round(selectedCount * 5)} MB)</li>}
                  {deletePhotos && <li>{selectedPhotosCount} interview photos (~{Math.round(selectedPhotosCount * 0.1)} MB)</li>}
                  <li className="font-semibold">Total: ~{estimatedSavingsMb.toFixed(1)} MB</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>

          <div className="space-y-3 py-4">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
              <p className="text-sm">All audit records will be preserved</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
              <p className="text-sm">All PDF reports will be preserved</p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
              <p className="text-sm">All extracted metadata will be preserved</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmation">Type "DELETE" to confirm:</Label>
            <Input
              id="confirmation"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder="DELETE"
              className="font-mono"
            />
          </div>

          {deleteMutation.isPending && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Deleting files... Please wait.</p>
              <Progress value={undefined} className="h-2" />
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handleCancel} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={confirmationText !== "DELETE" || deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Confirm Deletion"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cleanup Old Audit Files</DialogTitle>
          <DialogDescription>
            Delete mobile ZIPs and photos from passed audits older than the selected minimum age. Audit records and PDF reports will be preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="age">Minimum Age</Label>
              <Select value={minAgeDays.toString()} onValueChange={(v) => setMinAgeDays(parseInt(v))}>
                <SelectTrigger id="age">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">24 hours</SelectItem>
                  <SelectItem value="5">5 days</SelectItem>
                  <SelectItem value="15">15 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractor">Contractor ID (optional)</Label>
              <Input
                id="contractor"
                value={contractorFilter}
                onChange={(e) => setContractorFilter(e.target.value)}
                placeholder="Filter by contractor..."
              />
            </div>
          </div>

          {/* Delete options */}
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <Checkbox
                id="deleteZips"
                checked={deleteZips}
                onCheckedChange={(checked) => setDeleteZips(checked as boolean)}
              />
              <Label htmlFor="deleteZips" className="flex items-center gap-1 cursor-pointer">
                <Package className="h-4 w-4" />
                Delete ZIP Files
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="deletePhotos"
                checked={deletePhotos}
                onCheckedChange={(checked) => setDeletePhotos(checked as boolean)}
              />
              <Label htmlFor="deletePhotos" className="flex items-center gap-1 cursor-pointer">
                <Images className="h-4 w-4" />
                Delete Photos
              </Label>
            </div>
          </div>

          {/* Summary */}
          {!isLoading && cleanableAudits && cleanableAudits.length > 0 && (
            <Alert>
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-semibold">Found {cleanableAudits.length} cleanable audits</p>
                  {selectedCount > 0 && (
                    <>
                      <p className="text-sm">Selected: {selectedCount} audits</p>
                      {deleteZips && <p className="text-sm">• ZIP files: {selectedCount}</p>}
                      {deletePhotos && <p className="text-sm">• Photos: {selectedPhotosCount}</p>}
                      <p className="text-sm font-semibold">Estimated space to free: ~{estimatedSavingsMb.toFixed(1)} MB</p>
                    </>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Table */}
          <div className="border rounded-md">
            {isLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : cleanableAudits && cleanableAudits.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedAudits.size === cleanableAudits.length && cleanableAudits.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead>Days Old</TableHead>
                    <TableHead className="text-center">📦 ZIP</TableHead>
                    <TableHead className="text-center">📷 Photos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cleanableAudits.map((audit) => (
                    <TableRow key={audit.audit_id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedAudits.has(audit.audit_id)}
                          onCheckedChange={(checked) => handleSelectAudit(audit.audit_id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{audit.file_name}</TableCell>
                      <TableCell>{audit.days_since_review} days</TableCell>
                      <TableCell className="text-center">{audit.zip_url ? "✅" : "❌"}</TableCell>
                      <TableCell className="text-center">{audit.photo_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <p>No cleanable audits found matching the criteria.</p>
                <p className="text-sm mt-2">Try adjusting the age filter or contractor filter.</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClick}
              disabled={selectedCount === 0 || (!deleteZips && !deletePhotos)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Selected Files
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
