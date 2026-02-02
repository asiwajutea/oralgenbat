import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Search, Users, FolderOpen, RefreshCw } from "lucide-react";
import { BudgetStatsCard } from "@/components/payment/BudgetStatsCard";
import { InvoiceUploadDialog } from "@/components/payment/InvoiceUploadDialog";
import { PaymentTable } from "@/components/payment/PaymentTable";
import { useAllInterviewsForPayment, useBudgetStats } from "@/hooks/usePaymentTracking";
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
          <PaymentTable 
            records={assignedRecords} 
            isLoading={recordsLoading} 
            type="assigned"
            onRefresh={handleRefresh}
          />
        </TabsContent>

        <TabsContent value="unassigned">
          <PaymentTable 
            records={unassignedRecords} 
            isLoading={recordsLoading} 
            type="unassigned"
            onRefresh={handleRefresh}
          />
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
