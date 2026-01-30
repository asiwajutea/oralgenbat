import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Upload, FileText, Check, AlertCircle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface ParsedInvoiceEntry {
  folderName: string;
  interviewId: string;
  names: number;
  amount: number;
  matchedAuditId?: string | null;
}

export interface ParsedInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  contractor: string;
  vendorId: string;
  newPayments: ParsedInvoiceEntry[];
  additions: ParsedInvoiceEntry[];
  deductions: ParsedInvoiceEntry[];
  totals: {
    newPayments: number;
    additions: number;
    deductions: number;
    grandTotal: number;
  };
}

interface InvoiceUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete: () => void;
}

export const InvoiceUploadDialog = ({ open, onOpenChange, onUploadComplete }: InvoiceUploadDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedInvoice | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === "application/pdf") {
        setFile(droppedFile);
        setParsedData(null);
      } else {
        toast.error("Please upload a PDF file");
      }
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setParsedData(null);
    }
  };

  const parseInvoice = async () => {
    if (!file) return;
    
    setParsing(true);
    try {
      // Upload file to storage temporarily
      const fileName = `temp-invoice-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("audit-pdfs")
        .upload(`invoices/${fileName}`, file);

      if (uploadError) throw uploadError;

      // Call edge function to parse
      const { data, error } = await supabase.functions.invoke("parse-invoice-pdf", {
        body: { fileName: `invoices/${fileName}` },
      });

      if (error) throw error;
      
      setParsedData(data);
      toast.success("Invoice parsed successfully!");
    } catch (error) {
      console.error("Parse error:", error);
      toast.error("Failed to parse invoice. Please try again.");
    } finally {
      setParsing(false);
    }
  };

  const savePayments = async () => {
    if (!parsedData) return;
    
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Prepare all payment records
      const allRecords = [
        ...parsedData.newPayments.map(p => ({
          invoice_number: parsedData.invoiceNumber,
          invoice_date: parsedData.invoiceDate,
          contractor_name: parsedData.contractor,
          vendor_id: parsedData.vendorId,
          folder_name: p.folderName,
          interview_id: p.interviewId,
          audit_id: p.matchedAuditId || null,
          payment_type: "new_payment",
          names_count: p.names,
          pay_rate: 0.12,
          amount: p.amount,
          created_by: user?.id,
        })),
        ...parsedData.additions.map(p => ({
          invoice_number: parsedData.invoiceNumber,
          invoice_date: parsedData.invoiceDate,
          contractor_name: parsedData.contractor,
          vendor_id: parsedData.vendorId,
          folder_name: p.folderName,
          interview_id: p.interviewId,
          audit_id: p.matchedAuditId || null,
          payment_type: "addition",
          names_count: p.names,
          pay_rate: 0.12,
          amount: p.amount,
          created_by: user?.id,
        })),
        ...parsedData.deductions.map(p => ({
          invoice_number: parsedData.invoiceNumber,
          invoice_date: parsedData.invoiceDate,
          contractor_name: parsedData.contractor,
          vendor_id: parsedData.vendorId,
          folder_name: p.folderName,
          interview_id: p.interviewId,
          audit_id: p.matchedAuditId || null,
          payment_type: "deduction",
          names_count: Math.abs(p.names),
          pay_rate: 0.12,
          amount: Math.abs(p.amount),
          created_by: user?.id,
        })),
      ];

      const { error } = await supabase
        .from("payment_records")
        .upsert(allRecords, { onConflict: "invoice_number,folder_name,payment_type" });

      if (error) throw error;

      toast.success(`Saved ${allRecords.length} payment records`);
      onUploadComplete();
      handleClose();
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save payment records");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedData(null);
    onOpenChange(false);
  };

  const totalMatched = parsedData ? 
    [...parsedData.newPayments, ...parsedData.additions, ...parsedData.deductions]
      .filter(p => p.matchedAuditId).length : 0;
  
  const totalEntries = parsedData ? 
    parsedData.newPayments.length + parsedData.additions.length + parsedData.deductions.length : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Upload Invoice PDF
          </DialogTitle>
          <DialogDescription>
            Upload a Self-Billing Invoice (SBI) PDF to import payment records
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!parsedData ? (
            <>
              {/* Upload area */}
              <div
                className={cn(
                  "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
                  file && "border-emerald-500 bg-emerald-500/5"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="h-10 w-10 text-emerald-500" />
                    <div className="text-left">
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-2"
                      onClick={(e) => {
                        e.preventDefault();
                        setFile(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Drag & drop your invoice PDF here, or click to browse
                    </p>
                  </div>
                )}
              </div>

              {file && (
                <Button 
                  onClick={parseInvoice} 
                  disabled={parsing}
                  className="w-full"
                >
                  {parsing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Parsing Invoice...
                    </>
                  ) : (
                    "Parse Invoice"
                  )}
                </Button>
              )}
            </>
          ) : (
            <>
              {/* Parsed results */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <Label className="text-xs text-muted-foreground">Invoice #</Label>
                    <p className="font-medium">{parsedData.invoiceNumber}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Date</Label>
                    <p className="font-medium">{parsedData.invoiceDate}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Contractor</Label>
                    <p className="font-medium">{parsedData.contractor}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Matched</Label>
                    <p className="font-medium">{totalMatched} / {totalEntries} interviews</p>
                  </div>
                </div>

                <ScrollArea className="h-[300px] rounded-lg border">
                  <div className="p-4 space-y-4">
                    {parsedData.newPayments.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
                          New Payments ({parsedData.newPayments.length})
                        </h4>
                        <div className="space-y-1">
                          {parsedData.newPayments.map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-sm p-2 bg-emerald-500/5 rounded">
                              <span className="font-mono">{p.folderName}</span>
                              <div className="flex items-center gap-2">
                                <span>{p.names} names</span>
                                {p.matchedAuditId ? (
                                  <Check className="h-4 w-4 text-emerald-500" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-amber-500" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {parsedData.additions.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
                            Additions ({parsedData.additions.length})
                          </h4>
                          <div className="space-y-1">
                            {parsedData.additions.map((p, i) => (
                              <div key={i} className="flex items-center justify-between text-sm p-2 bg-blue-500/5 rounded">
                                <span className="font-mono">{p.folderName}</span>
                                <div className="flex items-center gap-2">
                                  <span>+{p.names} names</span>
                                  {p.matchedAuditId ? (
                                    <Check className="h-4 w-4 text-emerald-500" />
                                  ) : (
                                    <AlertCircle className="h-4 w-4 text-amber-500" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {parsedData.deductions.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                            Deductions ({parsedData.deductions.length})
                          </h4>
                          <div className="space-y-1">
                            {parsedData.deductions.map((p, i) => (
                              <div key={i} className="flex items-center justify-between text-sm p-2 bg-red-500/5 rounded">
                                <span className="font-mono">{p.folderName}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-red-600">{p.names} names</span>
                                  {p.matchedAuditId ? (
                                    <Check className="h-4 w-4 text-emerald-500" />
                                  ) : (
                                    <AlertCircle className="h-4 w-4 text-amber-500" />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>

                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <span className="font-medium">Grand Total</span>
                  <span className="text-xl font-bold">${parsedData.totals.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {parsedData && (
            <Button onClick={savePayments} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Save Payment Records
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceUploadDialog;
