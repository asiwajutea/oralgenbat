import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Users, FolderOpen, Edit } from "lucide-react";
import { InterviewJourneyTracker, createJourneySteps } from "@/components/payment/InterviewJourneyTracker";
import { PaymentInterviewRecord } from "@/hooks/usePaymentTracking";
import { BulkJourneyUpdateDialog } from "@/components/payment/BulkJourneyUpdateDialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

interface PaymentTableProps {
  records: PaymentInterviewRecord[];
  isLoading: boolean;
  type: "assigned" | "unassigned";
  onRefresh: () => void;
}

const PAGE_SIZE = 20;

export const PaymentTable = ({ records, isLoading, type, onRefresh }: PaymentTableProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Pagination
  const totalPages = Math.ceil(records.length / PAGE_SIZE);
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return records.slice(start, start + PAGE_SIZE);
  }, [records, currentPage]);

  // Reset page when records change
  useMemo(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

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

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("ellipsis");
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };

  const renderPaymentRow = (record: PaymentInterviewRecord) => {
    const journeySteps = createJourneySteps({
      auditExists: true,
      auditPassedAt: record.status === "Audit Passed" ? record.reviewed_at : null,
      assignedAt: record.assignment?.assigned_at || null,
      paymentReceivedAt: record.payment?.payment_type === "new_payment" ? record.payment.id : null,
      bookletPrintedAt: record.payment?.booklet_printed_at || null,
      bookletReceivedAt: record.payment?.booklet_received_at || null,
      bookletDeliveredAt: record.payment?.booklet_delivered_at || null,
    });

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
          <Badge 
            variant={
              record.status === "Audit Passed" ? "default" :
              record.status === "Audit Failed" ? "destructive" : "secondary"
            }
          >
            {record.status}
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
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Names</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="hidden md:table-cell">Team</TableHead>
                      <TableHead>Journey Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRecords.map(renderPaymentRow)}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, records.length)} of {records.length}
                  </p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {getPageNumbers().map((page, i) => (
                        <PaginationItem key={i}>
                          {page === "ellipsis" ? (
                            <PaginationEllipsis />
                          ) : (
                            <PaginationLink
                              onClick={() => setCurrentPage(page)}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          )}
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
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
