import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, Search, FileText, Users, FolderOpen, RefreshCw } from "lucide-react";
import { BudgetStatsCard } from "@/components/payment/BudgetStatsCard";
import { InterviewJourneyTracker, createJourneySteps } from "@/components/payment/InterviewJourneyTracker";
import { InvoiceUploadDialog } from "@/components/payment/InvoiceUploadDialog";
import { useAllInterviewsForPayment, useBudgetStats, PaymentInterviewRecord } from "@/hooks/usePaymentTracking";
import { useQueryClient } from "@tanstack/react-query";

const PaymentTracking = () => {
  const { userRole, profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // Determine contractor filter based on role
  const contractorId = useMemo(() => {
    if (userRole === "super_admin") return undefined; // See all
    return profile?.active_contractor_id || profile?.contractor_id;
  }, [userRole, profile]);

  const { data: records, isLoading: recordsLoading } = useAllInterviewsForPayment(contractorId);
  const { data: budgetStats, isLoading: statsLoading } = useBudgetStats(contractorId);

  // Check if user can upload invoices
  const canUpload = userRole === "super_admin" || userRole === "admin" || userRole === "contractor";

  // Filter records by search
  const filteredRecords = useMemo(() => {
    if (!records) return [];
    
    if (!searchQuery) return records;
    
    const query = searchQuery.toLowerCase();
    return records.filter(r => 
      r.file_name.toLowerCase().includes(query) ||
      r.interviewee_name?.toLowerCase().includes(query) ||
      r.interviewer_code?.toLowerCase().includes(query) ||
      r.payment?.invoice_number?.toLowerCase().includes(query)
    );
  }, [records, searchQuery]);

  // Separate assigned vs unassigned
  const assignedRecords = useMemo(() => 
    filteredRecords.filter(r => r.assignment !== null), [filteredRecords]);
  const unassignedRecords = useMemo(() => 
    filteredRecords.filter(r => r.assignment === null), [filteredRecords]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["all-interviews-payment"] });
    queryClient.invalidateQueries({ queryKey: ["budget-stats"] });
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

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by folder name, interviewee, or invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
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
                Interviews Assigned to Data Entry Teams
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
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Names</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="hidden md:table-cell">Team</TableHead>
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
                  <p>All interviews are assigned to teams</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Folder Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Names</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="hidden md:table-cell">Team</TableHead>
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
