import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, Search, AlertTriangle, Edit2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBulkCreatePayments } from "@/hooks/usePaymentTracking";
import { toast } from "sonner";

interface ManualInvoiceEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

interface PreviewRecord {
  folder_name: string;
  audit_id: string | null;
  names_count: number;
  names_override: number | null; // User can override
  found: boolean;
}

type PaymentType = "new_payment" | "addition" | "deduction";

const PAYMENT_TYPES = [
  { value: "new_payment", label: "New Interviews Processed" },
  { value: "addition", label: "Additions (Reversed Prior Deductions)" },
  { value: "deduction", label: "Deductions (Incorrect Prior Payments)" },
];

export const ManualInvoiceEntryDialog = ({
  open,
  onOpenChange,
  onComplete,
}: ManualInvoiceEntryDialogProps) => {
  const [inputText, setInputText] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("new_payment");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [previewRecords, setPreviewRecords] = useState<PreviewRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [totalNamesOverride, setTotalNamesOverride] = useState<number | null>(null);
  const [isEditingTotal, setIsEditingTotal] = useState(false);

  const bulkCreate = useBulkCreatePayments();

  // Parse input text into folder names
  const parseInput = (input: string): string[] => {
    return input
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  };

  // Search for matching audits when input changes
  useEffect(() => {
    const searchAudits = async () => {
      const folderNames = parseInput(inputText);
      if (folderNames.length === 0) {
        setPreviewRecords([]);
        return;
      }

      setIsSearching(true);

      try {
        // Batch fetch audits by file_name
        const { data: audits } = await supabase
          .from("audits")
          .select("id, file_name")
          .in("file_name", folderNames);

        const auditMap = new Map<string, string>(audits?.map(a => [a.file_name, a.id]) || []);

        // Fetch metadata for matched audits
        const auditIds = audits?.map(a => a.id) || [];
        const { data: metadata } = auditIds.length > 0
          ? await supabase
              .from("interview_metadata")
              .select("audit_id, total_names")
              .in("audit_id", auditIds)
          : { data: [] };

        const metadataMap = new Map<string, number>();
        metadata?.forEach(m => {
          if (m.audit_id) {
            metadataMap.set(m.audit_id, m.total_names || 0);
          }
        });

        // Build preview records
        const records: PreviewRecord[] = folderNames.map(name => {
          const auditId = auditMap.get(name) || null;
          const namesCount: number = auditId ? (metadataMap.get(auditId) || 0) : 0;
          
          return {
            folder_name: name,
            audit_id: auditId,
            names_count: namesCount,
            names_override: null,
            found: !!auditId,
          };
        });

        setPreviewRecords(records);
      } catch (error) {
        console.error("Search error:", error);
        toast.error("Failed to search for interviews");
      } finally {
        setIsSearching(false);
      }
    };

    // Debounce the search
    const timeoutId = setTimeout(searchAudits, 500);
    return () => clearTimeout(timeoutId);
  }, [inputText]);

  // Calculate stats
  const stats = useMemo(() => {
    const found = previewRecords.filter(r => r.found).length;
    const notFound = previewRecords.filter(r => !r.found).length;
    const calculatedTotal = previewRecords.reduce((sum, r) => {
      const count = r.names_override ?? r.names_count;
      return sum + count;
    }, 0);
    
    // Use override if set, otherwise use calculated
    const totalNames = totalNamesOverride !== null ? totalNamesOverride : calculatedTotal;

    return { found, notFound, totalNames, calculatedTotal };
  }, [previewRecords, totalNamesOverride]);

  const handleNamesOverride = (index: number, value: string) => {
    const numValue = parseInt(value, 10);
    setPreviewRecords(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        names_override: isNaN(numValue) ? null : numValue,
      };
      return updated;
    });
    setEditingIndex(null);
  };

  const handleSave = async () => {
    if (previewRecords.length === 0) return;

    setIsSaving(true);

    try {
      const finalInvoiceNumber = invoiceNumber.trim() || `MANUAL-${Date.now()}`;

      // Build entries - include ALL records (found and not found)
      let entries = previewRecords.map(r => ({
        folder_name: r.folder_name,
        audit_id: r.audit_id,
        names_count: r.names_override ?? r.names_count,
        payment_type: paymentType,
        invoice_number: finalInvoiceNumber,
      }));

      // If totalNamesOverride is set, distribute it across records
      if (totalNamesOverride !== null && entries.length > 0) {
        const currentTotal = entries.reduce((sum, e) => sum + e.names_count, 0);
        if (currentTotal > 0) {
          // Proportional distribution
          let distributed = 0;
          entries = entries.map((e, i) => {
            if (i === entries.length - 1) {
              return { ...e, names_count: totalNamesOverride - distributed };
            }
            const proportion = Math.round((e.names_count / currentTotal) * totalNamesOverride);
            distributed += proportion;
            return { ...e, names_count: proportion };
          });
        } else {
          // All zeros - assign full override to first record
          entries = entries.map((e, i) => ({
            ...e,
            names_count: i === 0 ? totalNamesOverride : 0,
          }));
        }
      }

      await bulkCreate.mutateAsync({ entries });

      toast.success(`Saved ${entries.length} payment record(s)`);
      onComplete();
      handleClose();
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save payment records");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setInputText("");
    setPaymentType("new_payment");
    setInvoiceNumber("");
    setPreviewRecords([]);
    setEditingIndex(null);
    setTotalNamesOverride(null);
    setIsEditingTotal(false);
    onOpenChange(false);
  };

  const handleTotalOverride = (value: string) => {
    const numValue = parseInt(value, 10);
    setTotalNamesOverride(isNaN(numValue) ? null : numValue);
    setIsEditingTotal(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manual Invoice Entry</DialogTitle>
          <DialogDescription>
            Enter folder names manually to create payment records.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden space-y-4 py-4">
          {/* Input Section */}
          <div className="space-y-2">
            <Label htmlFor="folder-names">
              Enter folder names (one per line, or comma separated)
            </Label>
            <Textarea
              id="folder-names"
              placeholder="NG71_696_20251103_1035&#10;NG71_697_20251103_1040&#10;NG71_698_20251103_1045"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={5}
              className="font-mono text-sm"
            />
          </div>

          {/* Options Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="payment-type">Payment Category</Label>
              <Select value={paymentType} onValueChange={(v) => setPaymentType(v as PaymentType)}>
                <SelectTrigger id="payment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map(pt => (
                    <SelectItem key={pt.value} value={pt.value}>
                      {pt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-number">Invoice Number (optional)</Label>
              <Input
                id="invoice-number"
                placeholder="Auto-generated if empty"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>
          </div>

          {/* Preview Section */}
          {previewRecords.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Preview</Label>
                {isSearching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>

              {/* Stats */}
              <div className="flex gap-3 text-sm">
                <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  <Check className="h-3 w-3 mr-1" />
                  Found: {stats.found}
                </Badge>
                {stats.notFound > 0 && (
                  <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                    <X className="h-3 w-3 mr-1" />
                    Not Found: {stats.notFound}
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1">
                  Total Names: 
                  {isEditingTotal ? (
                    <Input
                      type="number"
                      className="w-24 h-6 text-xs inline-flex ml-1"
                      defaultValue={stats.totalNames}
                      onBlur={(e) => handleTotalOverride(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleTotalOverride((e.target as HTMLInputElement).value);
                        }
                        if (e.key === 'Escape') {
                          setIsEditingTotal(false);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={() => setIsEditingTotal(true)}
                      className="inline-flex items-center gap-1 hover:text-primary ml-1"
                    >
                      {stats.totalNames.toLocaleString()}
                      {totalNamesOverride !== null && (
                        <span className="text-xs text-muted-foreground">(edited)</span>
                      )}
                      <Edit2 className="h-3 w-3 opacity-50" />
                    </button>
                  )}
                </Badge>
              </div>

              {/* Preview Table */}
              <ScrollArea className="h-[200px] border rounded-md">
                <div className="p-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="pb-2 font-medium">Folder Name</th>
                        <th className="pb-2 font-medium text-right">Names</th>
                        <th className="pb-2 font-medium text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRecords.map((record, index) => (
                        <tr key={index} className="border-b last:border-0">
                          <td className="py-2 font-mono text-xs">
                            {record.folder_name}
                          </td>
                          <td className="py-2 text-right">
                            {editingIndex === index ? (
                              <Input
                                type="number"
                                className="w-20 h-7 text-xs ml-auto"
                                defaultValue={record.names_override ?? record.names_count}
                                onBlur={(e) => handleNamesOverride(index, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleNamesOverride(index, (e.target as HTMLInputElement).value);
                                  }
                                }}
                                autoFocus
                              />
                            ) : (
                              <button
                                onClick={() => setEditingIndex(index)}
                                className="inline-flex items-center gap-1 hover:text-primary"
                              >
                                {record.names_override ?? record.names_count}
                                <Edit2 className="h-3 w-3 opacity-50" />
                              </button>
                            )}
                          </td>
                          <td className="py-2 text-center">
                            {record.found ? (
                              <Check className="h-4 w-4 text-green-600 mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-red-600 mx-auto" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>

              {stats.notFound > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    {stats.notFound} folder name(s) were not found in the system. They will be saved without a linked interview.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={previewRecords.length === 0 || isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save {previewRecords.length} Record{previewRecords.length !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
