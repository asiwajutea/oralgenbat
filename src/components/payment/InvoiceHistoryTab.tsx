import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Trash2,
  Check,
  X,
  FileText,
  Search,
} from "lucide-react";
import {
  usePaymentRecords,
  useUpdatePaymentRecord,
  useDeletePaymentRecord,
  PaymentRecord,
} from "@/hooks/usePaymentTracking";
import { format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  new_payment: "New Payment",
  addition: "Addition",
  deduction: "Deduction",
};

interface InvoiceGroup {
  invoice_number: string;
  invoice_date: string;
  contractor_name: string | null;
  payment_type: string;
  records: PaymentRecord[];
  totalNames: number;
}

export const InvoiceHistoryTab = () => {
  const { data: records, isLoading } = usePaymentRecords();
  const updateRecord = useUpdatePaymentRecord();
  const deleteRecord = useDeletePaymentRecord();
  const isMobile = useIsMobile();

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ names_count?: number; payment_type?: string }>({});
  const [deleteTarget, setDeleteTarget] = useState<{ type: "record" | "invoice"; id: string; invoiceNumber?: string } | null>(null);

  // Group records by invoice_number
  const invoiceGroups = useMemo((): InvoiceGroup[] => {
    if (!records) return [];

    const groupMap = new Map<string, PaymentRecord[]>();
    records.forEach((r) => {
      const existing = groupMap.get(r.invoice_number) || [];
      existing.push(r);
      groupMap.set(r.invoice_number, existing);
    });

    let groups = Array.from(groupMap.entries()).map(([invoice_number, recs]) => ({
      invoice_number,
      invoice_date: recs[0].invoice_date,
      contractor_name: recs[0].contractor_name,
      payment_type: recs[0].payment_type,
      records: recs,
      totalNames: recs.reduce((sum, r) => sum + r.names_count, 0),
    }));

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      groups = groups.filter(
        (g) =>
          g.invoice_number.toLowerCase().includes(q) ||
          g.contractor_name?.toLowerCase().includes(q) ||
          g.records.some((r) => r.folder_name.toLowerCase().includes(q))
      );
    }

    return groups.sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime());
  }, [records, searchQuery]);

  const handleStartEdit = (record: PaymentRecord) => {
    setEditingRecord(record.id);
    setEditValues({ names_count: record.names_count, payment_type: record.payment_type });
  };

  const handleSaveEdit = async (recordId: string) => {
    await updateRecord.mutateAsync({ recordId, updates: editValues });
    setEditingRecord(null);
    setEditValues({});
  };

  const handleCancelEdit = () => {
    setEditingRecord(null);
    setEditValues({});
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === "record") {
      await deleteRecord.mutateAsync(deleteTarget.id);
    } else if (deleteTarget.type === "invoice" && records) {
      // Delete all records in this invoice
      const invoiceRecords = records.filter((r) => r.invoice_number === deleteTarget.invoiceNumber);
      for (const r of invoiceRecords) {
        await deleteRecord.mutateAsync(r.id);
      }
    }
    setDeleteTarget(null);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!records || records.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No invoices yet</p>
            <p className="text-sm">Payment records will appear here once created.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search invoices by number, contractor, or folder name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Invoice List */}
      <div className="space-y-2">
        {invoiceGroups.map((group) => {
          const isExpanded = expandedInvoice === group.invoice_number;

          return (
            <Card key={group.invoice_number}>
              <Collapsible open={isExpanded} onOpenChange={() => setExpandedInvoice(isExpanded ? null : group.invoice_number)}>
                <CollapsibleTrigger asChild>
                  <button className="w-full text-left p-3 sm:p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-xs sm:text-sm truncate">{group.invoice_number}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">
                            {format(new Date(group.invoice_date), "MMM d, yyyy")}
                            {!isMobile && group.contractor_name && ` · ${group.contractor_name}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 flex-wrap justify-end">
                        {!isMobile && (
                          <Badge variant="outline" className="text-xs">
                            {group.records.length} folder{group.records.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px] sm:text-xs">
                          {group.totalNames} names
                        </Badge>
                        <Badge
                          className={`text-[10px] sm:text-xs ${
                            group.payment_type === "deduction"
                              ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                              : group.payment_type === "addition"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                              : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          }`}
                        >
                          {PAYMENT_TYPE_LABELS[group.payment_type] || group.payment_type}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 sm:h-7 sm:w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({ type: "invoice", id: group.invoice_number, invoiceNumber: group.invoice_number });
                          }}
                        >
                          <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t px-3 sm:px-4 pb-3 sm:pb-4">
                    {isMobile ? (
                      // Mobile: card-based layout
                      <div className="space-y-2 mt-3">
                        {group.records.map((record) => (
                          <div key={record.id} className="border rounded-lg p-3 space-y-2">
                            <p className="font-mono text-xs truncate">{record.folder_name}</p>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div>
                                  <span className="text-[10px] text-muted-foreground">Names</span>
                                  {editingRecord === record.id ? (
                                    <Input
                                      type="number"
                                      className="w-16 h-7 text-xs"
                                      value={editValues.names_count ?? ""}
                                      onChange={(e) =>
                                        setEditValues((prev) => ({
                                          ...prev,
                                          names_count: parseInt(e.target.value, 10) || 0,
                                        }))
                                      }
                                    />
                                  ) : (
                                    <p className="text-sm font-medium">{record.names_count}</p>
                                  )}
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted-foreground">Type</span>
                                  {editingRecord === record.id ? (
                                    <Select
                                      value={editValues.payment_type}
                                      onValueChange={(v) => setEditValues((prev) => ({ ...prev, payment_type: v }))}
                                    >
                                      <SelectTrigger className="h-7 text-xs w-24">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="new_payment">New Payment</SelectItem>
                                        <SelectItem value="addition">Addition</SelectItem>
                                        <SelectItem value="deduction">Deduction</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">
                                      {PAYMENT_TYPE_LABELS[record.payment_type] || record.payment_type}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {editingRecord === record.id ? (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSaveEdit(record.id)}>
                                      <Check className="h-3.5 w-3.5 text-green-600" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelEdit}>
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStartEdit(record)}>
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget({ type: "record", id: record.id })}>
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      // Desktop: table layout
                      <table className="w-full text-sm mt-3">
                        <thead>
                          <tr className="text-left border-b text-muted-foreground">
                            <th className="pb-2 font-medium">Folder Name</th>
                            <th className="pb-2 font-medium text-right">Names</th>
                            <th className="pb-2 font-medium text-center">Type</th>
                            <th className="pb-2 font-medium text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.records.map((record) => (
                            <tr key={record.id} className="border-b last:border-0">
                              <td className="py-2 font-mono text-xs">{record.folder_name}</td>
                              <td className="py-2 text-right">
                                {editingRecord === record.id ? (
                                  <Input
                                    type="number"
                                    className="w-20 h-7 text-xs ml-auto"
                                    value={editValues.names_count ?? ""}
                                    onChange={(e) =>
                                      setEditValues((prev) => ({
                                        ...prev,
                                        names_count: parseInt(e.target.value, 10) || 0,
                                      }))
                                    }
                                  />
                                ) : (
                                  record.names_count
                                )}
                              </td>
                              <td className="py-2 text-center">
                                {editingRecord === record.id ? (
                                  <Select
                                    value={editValues.payment_type}
                                    onValueChange={(v) => setEditValues((prev) => ({ ...prev, payment_type: v }))}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-28 mx-auto">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="new_payment">New Payment</SelectItem>
                                      <SelectItem value="addition">Addition</SelectItem>
                                      <SelectItem value="deduction">Deduction</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {PAYMENT_TYPE_LABELS[record.payment_type] || record.payment_type}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 text-right">
                                {editingRecord === record.id ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSaveEdit(record.id)}>
                                      <Check className="h-3.5 w-3.5 text-green-600" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelEdit}>
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleStartEdit(record)}>
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteTarget({ type: "record", id: record.id })}>
                                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}

        {invoiceGroups.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No invoices match your search.</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "invoice" ? "Invoice" : "Record"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "invoice"
                ? `This will delete all payment records under invoice "${deleteTarget.invoiceNumber}". This action cannot be undone.`
                : "This will permanently delete this payment record. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
