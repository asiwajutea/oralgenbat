import { useMemo, useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FileText, Users, FolderOpen, Edit } from "lucide-react";
import { InterviewJourneyTracker, createJourneySteps } from "@/components/payment/InterviewJourneyTracker";
import { PaymentInterviewRecord } from "@/hooks/usePaymentTracking";
import { BulkJourneyUpdateDialog } from "@/components/payment/BulkJourneyUpdateDialog";
import { AuditPagination } from "@/components/AuditPagination";

interface PaymentTableProps {
  records: PaymentInterviewRecord[];
  isLoading: boolean;
  type: "assigned" | "unassigned";
  onRefresh: () => void;
}

const DEFAULT_PAGE_SIZE = 20;

// Derive journey status from record data
const getJourneyStatus = (record: PaymentInterviewRecord): string => {
  if (record.payment?.booklet_delivered_at) return "Booklet Delivered";
  if (record.payment?.booklet_received_at) return "Booklet Received";
  if (record.payment?.booklet_printed_at) return "Booklet Printed";
  if (record.payment && record.payment.payment_type !== "deduction") return "Payment Received";
  if (record.assignment) return "Transcribed";
  if (record.status === "Audit Passed") return "BAC Passed";
  return "Submitted";
};

// Get journey status badge variant
const getJourneyBadgeVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
  if (status === "Booklet Delivered") return "default";
  if (status === "Booklet Received" || status === "Booklet Printed") return "secondary";
  if (status === "Payment Received" || status === "Transcribed") return "outline";
  return "outline";
};

export const PaymentTable = ({ records, isLoading, type, onRefresh }: PaymentTableProps) => {
  const isMobile = useIsMobile();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePersistentPageSize("payment-table", DEFAULT_PAGE_SIZE);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Pagination
  const totalPages = Math.ceil(records.length / itemsPerPage);
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return records.slice(start, start + itemsPerPage);
  }, [records, currentPage, itemsPerPage]);

  // Reset page when total pages changes and current page is out of bounds
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages]);

  // Selection handlers
  const isAllSelected = paginatedRecords.length > 0 && paginatedRecords.every(r => selectedIds.has(r.id));
  const isSomeSelected = paginatedRecords.some(r => selectedIds.has(r.id));

  const toggleAll = () => {
    if (isAllSelected) {
      const newSet = new Set(selectedIds);
      paginatedRecords.forEach(r => newSet.delete(r.id));
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      paginatedRecords.forEach(r => newSet.add(r.id));
      setSelectedIds(newSet);
    }
  };

  const toggleOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const selectedRecords = records.filter(r => selectedIds.has(r.id));
  
  const handleItemsPerPageChange = (newSize: number) => {
    setItemsPerPage(newSize);
    setCurrentPage(1);
  };

  const createRecordJourneySteps = (record: PaymentInterviewRecord) => {
    const journeySteps = createJourneySteps({
      auditExists: true,
      auditPassedAt: record.status === "Audit Passed" ? record.reviewed_at : null,
      assignedAt: record.assignment?.assigned_at || null,
      // Fix: Payment is received if record exists and is not a deduction
      paymentReceivedAt: record.payment && record.payment.payment_type !== "deduction" 
        ? (record.payment.booklet_printed_at || record.payment.booklet_received_at || record.payment.booklet_delivered_at || new Date().toISOString()) 
        : null,
      bookletPrintedAt: record.payment?.booklet_printed_at || null,
      bookletReceivedAt: record.payment?.booklet_received_at || null,
      bookletDeliveredAt: record.payment?.booklet_delivered_at || null,
    });
    return journeySteps;
  };

  const renderPaymentRow = (record: PaymentInterviewRecord) => {
    const journeySteps = createRecordJourneySteps(record);
    const journeyStatus = getJourneyStatus(record);

    return (
      <TableRow key={record.id}>
        <TableCell className="w-10">
          <Checkbox
            checked={selectedIds.has(record.id)}
            onCheckedChange={() => toggleOne(record.id)}
            aria-label={`Select ${record.file_name}`}
          />
        </TableCell>
        <TableCell>
          <div className="space-y-1">
            <span className="font-mono text-sm font-medium">{record.file_name}</span>
            {record.interviewee_name && (
              <p className="text-xs text-muted-foreground">{record.interviewee_name}</p>
            )}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={getJourneyBadgeVariant(journeyStatus)}>
            {journeyStatus}
          </Badge>
        </TableCell>
        <TableCell className="text-right font-medium">
          {record.total_names?.toLocaleString() || "-"}
        </TableCell>
        <TableCell>
          {record.payment ? (
            <div className="space-y-1">
              <Badge variant="outline" className="text-xs">
                {record.payment.invoice_number}
              </Badge>
              <p className="text-xs text-muted-foreground">
                ${record.payment.amount?.toFixed(2) || "0.00"}
              </p>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No payment</span>
          )}
        </TableCell>
        <TableCell className="hidden md:table-cell">
          {record.assignment?.team_name || "-"}
        </TableCell>
        <TableCell className="min-w-[300px]">
          <InterviewJourneyTracker steps={journeySteps} compact />
        </TableCell>
      </TableRow>
    );
  };

  // Mobile accordion view
  const renderMobileCard = (record: PaymentInterviewRecord) => {
    const journeySteps = createRecordJourneySteps(record);
    const journeyStatus = getJourneyStatus(record);

    return (
      <AccordionItem key={record.id} value={record.id} className="border rounded-lg mb-2 bg-card">
        <div className="flex items-center gap-2 px-3 py-2">
          <Checkbox
            checked={selectedIds.has(record.id)}
            onCheckedChange={() => toggleOne(record.id)}
            aria-label={`Select ${record.file_name}`}
            onClick={(e) => e.stopPropagation()}
          />
          <AccordionTrigger className="flex-1 hover:no-underline py-0 [&>svg]:ml-auto">
            <div className="flex items-center justify-between w-full gap-2 pr-2">
              <span className="font-mono text-xs truncate max-w-[180px]">{record.file_name}</span>
              <Badge variant={getJourneyBadgeVariant(journeyStatus)} className="text-[10px] shrink-0">
                {journeyStatus}
              </Badge>
            </div>
          </AccordionTrigger>
        </div>
        <AccordionContent className="px-3 pb-3 pt-0">
          <div className="space-y-3">
            {record.interviewee_name && (
              <p className="text-xs text-muted-foreground">{record.interviewee_name}</p>
            )}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Names</span>
                <p className="font-medium">{record.total_names?.toLocaleString() || "-"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Team</span>
                <p className="font-medium truncate">{record.assignment?.team_name || "-"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Payment</span>
                <p className="font-medium">
                  {record.payment ? (
                    <span className="flex flex-col">
                      <span className="text-xs">{record.payment.invoice_number}</span>
                      <span className="text-xs text-muted-foreground">${record.payment.amount?.toFixed(2) || "0.00"}</span>
                    </span>
                  ) : "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Audit Status</span>
                <Badge 
                  variant={
                    record.status === "Audit Passed" ? "default" :
                    record.status === "Audit Failed" ? "destructive" : "secondary"
                  }
                  className="text-[10px]"
                >
                  {record.status}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Journey Progress</p>
              <InterviewJourneyTracker steps={journeySteps} compact />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  const isAssigned = type === "assigned";
  const Icon = isAssigned ? Users : FolderOpen;
  const title = isAssigned ? "Interviews Assigned to Data Entry Teams" : "Interviews Not Yet Assigned";
  const emptyMessage = isAssigned ? "No assigned interviews found" : "All interviews are assigned to teams";

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Icon className={`h-5 w-5 ${isAssigned ? "text-primary" : "text-muted-foreground"}`} />
              {title}
            </CardTitle>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} selected
                </span>
                <Button variant="outline" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
                <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Update Journey
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{emptyMessage}</p>
            </div>
          ) : (
            <>
              {isMobile ? (
                // Mobile accordion view
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all on page"
                    />
                    <span className="text-xs text-muted-foreground">Select all</span>
                  </div>
                  <Accordion type="single" collapsible className="space-y-0">
                    {paginatedRecords.map(renderMobileCard)}
                  </Accordion>
                </div>
              ) : (
                // Desktop table view
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={isAllSelected}
                            onCheckedChange={toggleAll}
                            aria-label="Select all on page"
                            {...(isSomeSelected && !isAllSelected ? { "data-state": "indeterminate" } : {})}
                          />
                        </TableHead>
                        <TableHead>Folder Name</TableHead>
                        <TableHead>Journey Status</TableHead>
                        <TableHead className="text-right">Names</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="hidden md:table-cell">Team</TableHead>
                        <TableHead>Journey Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedRecords.map(renderPaymentRow)}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Pagination - using AuditPagination component */}
              <AuditPagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={records.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            </>
          )}
        </CardContent>
      </Card>

      <BulkJourneyUpdateDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        selectedRecords={selectedRecords}
        onComplete={() => {
          clearSelection();
          onRefresh();
        }}
      />
    </>
  );
};
