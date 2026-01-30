import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Search, FileText, Users, FolderOpen, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { BudgetStatsCard } from "@/components/payment/BudgetStatsCard";
import { InterviewJourneyTracker, createJourneySteps } from "@/components/payment/InterviewJourneyTracker";
import { InvoiceUploadDialog } from "@/components/payment/InvoiceUploadDialog";
import { useEnrichedPaymentRecords, useBudgetStats, useInvoices, EnrichedPaymentRecord } from "@/hooks/usePaymentTracking";
import { useQueryClient } from "@tanstack/react-query";

const PaymentTracking = () => {
  const { userRole, profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<string>("all");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // Determine contractor filter based on role
  const contractorId = useMemo(() => {
    if (userRole === "super_admin") return undefined; // See all
    return profile?.active_contractor_id || profile?.contractor_id;
  }, [userRole, profile]);

  const { data: records, isLoading: recordsLoading } = useEnrichedPaymentRecords(contractorId);
  const { data: budgetStats, isLoading: statsLoading } = useBudgetStats(contractorId);
  const { data: invoices } = useInvoices();

  // Check if user can upload invoices
  const canUpload = userRole === "super_admin" || userRole === "admin" || userRole === "contractor";

  // Filter records
  const filteredRecords = useMemo(() => {
    if (!records) return [];
    
    let filtered = records;
    
    // Filter by invoice
    if (selectedInvoice !== "all") {
      filtered = filtered.filter(r => r.invoice_number === selectedInvoice);
    }
    
    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.folder_name.toLowerCase().includes(query) ||
        r.interview_id?.toLowerCase().includes(query) ||
        r.invoice_number.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [records, selectedInvoice, searchQuery]);

  // Separate assigned vs unassigned
  const assignedRecords = useMemo(() => 
    filteredRecords.filter(r => r.assignment), [filteredRecords]);
  const unassignedRecords = useMemo(() => 
    filteredRecords.filter(r => !r.assignment), [filteredRecords]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["payment-records"] });
    queryClient.invalidateQueries({ queryKey: ["enriched-payment-records"] });
    queryClient.invalidateQueries({ queryKey: ["budget-stats"] });
  };

  const renderPaymentRow = (record: EnrichedPaymentRecord) => {
    const journeySteps = createJourneySteps({
      auditExists: !!record.audit,
      auditPassedAt: record.audit?.status === "Audit Passed" ? record.audit.reviewed_at : null,
      assignedAt: record.assignment?.assigned_at,
      paymentReceivedAt: record.payment_type === "new_payment" ? record.created_at : null,
      bookletPrintedAt: record.booklet_printed_at,
      bookletReceivedAt: record.booklet_received_at,
      bookletDeliveredAt: record.booklet_delivered_at,
    });

    return (
      <TableRow key={record.id}>
        <TableCell>
          <div className="space-y-1">
            <span className="font-mono text-sm font-medium">{record.folder_name}</span>
            {record.interview_id && (
              <p className="text-xs text-muted-foreground">ID: {record.interview_id}</p>
            )}
          </div>
        </TableCell>
        <TableCell>
          <Badge 
            variant={
              record.payment_type === "new_payment" ? "default" :
              record.payment_type === "addition" ? "secondary" : "destructive"
            }
          >
            {record.payment_type === "new_payment" ? "New" :
             record.payment_type === "addition" ? "Addition" : "Deduction"}
          </Badge>
        </TableCell>
        <TableCell className="text-right font-medium">
          {record.payment_type === "deduction" ? "-" : ""}
          {record.names_count.toLocaleString()}
        </TableCell>
        <TableCell className="text-right">
          ${record.amount?.toFixed(2) || "0.00"}
        </TableCell>
        <TableCell className="hidden md:table-cell">
          {record.invoice_number}
        </TableCell>
        <TableCell className="min-w-[300px]">
          <InterviewJourneyTracker steps={journeySteps} compact />
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Payment & Budget Tracking</h1>
          <p className="text-muted-foreground">
            Track interview payments and budget allocation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {canUpload && (
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Invoice
            </Button>
          )}
        </div>
      </div>

      {/* Budget Stats */}
      <BudgetStatsCard stats={budgetStats || null} isLoading={statsLoading} />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by folder name or interview ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedInvoice} onValueChange={setSelectedInvoice}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="All Invoices" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Invoices</SelectItem>
                {invoices?.map(inv => (
                  <SelectItem key={inv.invoice_number} value={inv.invoice_number}>
                    {inv.invoice_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="assigned" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assigned" className="gap-2">
            <Users className="h-4 w-4" />
            Assigned to Clerks
            <Badge variant="secondary" className="ml-1">
              {assignedRecords.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="unassigned" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            Not Assigned
            <Badge variant="outline" className="ml-1">
              {unassignedRecords.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assigned">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Interviews Ready for Payment Processing
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recordsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : assignedRecords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No assigned interviews found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Folder Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Names</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="hidden md:table-cell">Invoice</TableHead>
                        <TableHead>Journey Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignedRecords.map(renderPaymentRow)}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unassigned">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-muted-foreground" />
                Interviews Not Yet Assigned
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recordsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : unassignedRecords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>All interviews are assigned to clerks</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Folder Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Names</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="hidden md:table-cell">Invoice</TableHead>
                        <TableHead>Journey Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unassignedRecords.map(renderPaymentRow)}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Upload Dialog */}
      <InvoiceUploadDialog 
        open={uploadDialogOpen} 
        onOpenChange={setUploadDialogOpen}
        onUploadComplete={handleRefresh}
      />
    </div>
  );
};

export default PaymentTracking;
