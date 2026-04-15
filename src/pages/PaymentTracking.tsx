import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Upload,
  Search,
  Users,
  FolderOpen,
  RefreshCw,
  FileText,
  Edit,
  ChevronDown,
  Filter,
  X,
  ArrowUpDown,
} from "lucide-react";
import { BudgetStatsCard } from "@/components/payment/BudgetStatsCard";
import { InvoiceUploadDialog } from "@/components/payment/InvoiceUploadDialog";
import { ManualInvoiceEntryDialog } from "@/components/payment/ManualInvoiceEntryDialog";
import { PaymentTable } from "@/components/payment/PaymentTable";
import { InvoiceHistoryTab } from "@/components/payment/InvoiceHistoryTab";
import { SetBudgetTargetDialog } from "@/components/payment/SetBudgetTargetDialog";
import { useAllInterviewsForPayment, useBudgetStats, useBudgetTarget } from "@/hooks/usePaymentTracking";
import { useQueryClient } from "@tanstack/react-query";
import { PaymentInterviewRecord } from "@/hooks/usePaymentTracking";

// Journey status derivation
const getJourneyStatus = (record: PaymentInterviewRecord): string => {
  if (record.payment?.booklet_delivered_at) return "Booklet Delivered";
  if (record.payment?.booklet_received_at) return "Booklet Received";
  if (record.payment?.booklet_printed_at) return "Booklet Printed";
  if (record.payment && record.payment.payment_type !== "deduction") return "Payment Received";
  if (record.assignment) return "Transcribed";
  if (record.status === "Audit Passed") return "BAC Passed";
  return "Submitted";
};

const JOURNEY_STATUSES = [
  "Submitted",
  "BAC Passed",
  "Transcribed",
  "Payment Received",
  "Booklet Printed",
  "Booklet Received",
  "Booklet Delivered",
];

const PAYMENT_TYPES = [
  { value: "has_payment", label: "Has Payment" },
  { value: "no_payment", label: "No Payment" },
  { value: "new_payment", label: "New Payment" },
  { value: "addition", label: "Addition" },
  { value: "deduction", label: "Deduction (Revoked)" },
];

const PaymentTracking = () => {
  const { userRole, profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [journeyStatusFilter, setJourneyStatusFilter] = useState<string>("");
  const [paymentFilter, setPaymentFilter] = useState<string>("");
  const [entryStatusFilter, setEntryStatusFilter] = useState<string>("");
  const [sortField, setSortField] = useState<string>("file_name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Determine contractor filter based on role
  const contractorId = useMemo(() => {
    if (userRole === "super_admin") return undefined; // See all
    return profile?.active_contractor_id || profile?.contractor_id;
  }, [userRole, profile]);

  const { data: records, isLoading: recordsLoading } = useAllInterviewsForPayment(contractorId);
  const { data: budgetStats, isLoading: statsLoading } = useBudgetStats(contractorId);
  const { data: budgetTarget } = useBudgetTarget(contractorId);

  // Check if user can set budget
  const canSetBudget = userRole === "super_admin" || userRole === "admin" || userRole === "contractor";
  const effectiveContractorId = contractorId || profile?.contractor_id || "global";

  // Check if user can upload invoices
  const canUpload = userRole === "super_admin" || userRole === "admin" || userRole === "contractor";

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (journeyStatusFilter) count++;
    if (paymentFilter) count++;
    if (entryStatusFilter) count++;
    return count;
  }, [searchQuery, journeyStatusFilter, paymentFilter, entryStatusFilter]);

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery("");
    setJourneyStatusFilter("");
    setPaymentFilter("");
    setEntryStatusFilter("");
  };

  // Filter and sort records - ensure records is defined before processing
  const filteredRecords = useMemo(() => {
    if (!records || !Array.isArray(records)) return [];

    let filtered = records;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.file_name.toLowerCase().includes(query) ||
          r.interviewee_name?.toLowerCase().includes(query) ||
          r.interviewer_code?.toLowerCase().includes(query) ||
          r.payment?.invoice_number?.toLowerCase().includes(query),
      );
    }

    // Journey status filter
    if (journeyStatusFilter) {
      filtered = filtered.filter((r) => getJourneyStatus(r) === journeyStatusFilter);
    }

    // Payment type filter
    if (paymentFilter) {
      if (paymentFilter === "has_payment") {
        filtered = filtered.filter((r) => r.payment !== null);
      } else if (paymentFilter === "no_payment") {
        filtered = filtered.filter((r) => r.payment === null);
      } else {
        filtered = filtered.filter((r) => r.payment?.payment_type === paymentFilter);
      }
    }

    // Entry status filter
    if (entryStatusFilter) {
      if (entryStatusFilter === "not_assigned") {
        filtered = filtered.filter((r) => r.assignment === null);
      } else {
        filtered = filtered.filter((r) => r.assignment?.entry_status === entryStatusFilter);
      }
    }

    // Sorting
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "file_name":
          comparison = a.file_name.localeCompare(b.file_name);
          break;
        case "total_names":
          comparison = (a.total_names || 0) - (b.total_names || 0);
          break;
        case "reviewed_at":
          comparison = new Date(a.reviewed_at || 0).getTime() - new Date(b.reviewed_at || 0).getTime();
          break;
        default:
          comparison = a.file_name.localeCompare(b.file_name);
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [records, searchQuery, journeyStatusFilter, paymentFilter, entryStatusFilter, sortField, sortOrder]);

  // Separate assigned vs unassigned
  const assignedRecords = useMemo(() => filteredRecords.filter((r) => r.assignment !== null), [filteredRecords]);
  const unassignedRecords = useMemo(() => filteredRecords.filter((r) => r.assignment === null), [filteredRecords]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["all-interviews-payment"] });
    queryClient.invalidateQueries({ queryKey: ["budget-stats"] });
  };

  return (
    <div className="container mx-auto py-4 sm:py-6 px-3 sm:px-4 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Payment & Budget Tracking</h1>
          <p className="text-sm text-muted-foreground hidden sm:block">Track interview payments and budget allocation</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {canUpload && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Upload className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Payment Data</span>
                  <span className="sm:hidden">Add</span>
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setPdfDialogOpen(true)}>
                  <FileText className="h-4 w-4 mr-2" />
                  Upload Invoice PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setManualDialogOpen(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Manual Entry
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Budget Stats */}
      <BudgetStatsCard
        stats={budgetStats || null}
        isLoading={statsLoading}
        budgetTarget={budgetTarget}
        canSetBudget={canSetBudget}
        onSetBudget={() => setBudgetDialogOpen(true)}
      />

      {/* Assignment & Payment Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card>
          <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4 px-3 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Assigned to Clerks</p>
                <p className="text-lg sm:text-2xl font-bold text-blue-600">
                  {records ? records.filter(r => r.assignment !== null).length : 0}
                </p>
              </div>
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4 px-3 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Total Paid</p>
                <p className="text-lg sm:text-2xl font-bold text-green-600">
                  {records ? records.filter(r => r.payment !== null).length : 0}
                </p>
              </div>
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3 sm:pt-4 sm:pb-4 px-3 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Assigned, Not Paid</p>
                <p className="text-lg sm:text-2xl font-bold text-amber-600">
                  {records ? records.filter(r => r.assignment !== null && r.payment === null).length : 0}
                </p>
              </div>
              <Search className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Search Row */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by folder name, interviewee, or invoice..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="gap-2">
                <Filter className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>

            {/* Collapsible Filters */}
            <Collapsible open={showFilters} onOpenChange={setShowFilters}>
              <CollapsibleContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
                  {/* Journey Status */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Journey Status</label>
                    <Select value={journeyStatusFilter || "all"} onValueChange={(v) => setJourneyStatusFilter(v === "all" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {JOURNEY_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Payment Status */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Payment</label>
                    <Select value={paymentFilter || "all"} onValueChange={(v) => setPaymentFilter(v === "all" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="All payments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All payments</SelectItem>
                        {PAYMENT_TYPES.map((pt) => (
                          <SelectItem key={pt.value} value={pt.value}>
                            {pt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Entry Status */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Entry Status</label>
                    <Select value={entryStatusFilter || "all"} onValueChange={(v) => setEntryStatusFilter(v === "all" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="All entry statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="not_assigned">Not Assigned</SelectItem>
                        <SelectItem value="typing_in_progress">Typing In Progress</SelectItem>
                        <SelectItem value="data_entry_complete">Data Entry Complete</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sort By */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Sort By</label>
                    <div className="flex gap-2">
                      <Select value={sortField} onValueChange={setSortField}>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="file_name">Folder Name</SelectItem>
                          <SelectItem value="total_names">Names Count</SelectItem>
                          <SelectItem value="reviewed_at">Review Date</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                      >
                        <ArrowUpDown className={`h-4 w-4 ${sortOrder === "asc" ? "rotate-180" : ""}`} />
                      </Button>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="assigned" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="assigned" className="gap-1 sm:gap-2 text-xs sm:text-sm">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Assigned to Clerks</span>
            <span className="sm:hidden">Assigned</span>
            <Badge variant="secondary" className="ml-1 text-[10px] sm:text-xs">
              {assignedRecords.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="unassigned" className="gap-1 sm:gap-2 text-xs sm:text-sm">
            <FolderOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Not Assigned</span>
            <span className="sm:hidden">Unassigned</span>
            <Badge variant="outline" className="ml-1 text-[10px] sm:text-xs">
              {unassignedRecords.length}
            </Badge>
          </TabsTrigger>
          {canUpload && (
            <TabsTrigger value="invoices" className="gap-1 sm:gap-2 text-xs sm:text-sm">
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Invoice History</span>
              <span className="sm:hidden">Invoices</span>
            </TabsTrigger>
          )}
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

        {canUpload && (
          <TabsContent value="invoices">
            <InvoiceHistoryTab />
          </TabsContent>
        )}
      </Tabs>

      {/* Upload Dialogs */}
      <InvoiceUploadDialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen} onUploadComplete={handleRefresh} />
      <ManualInvoiceEntryDialog open={manualDialogOpen} onOpenChange={setManualDialogOpen} onComplete={handleRefresh} />
    </div>
  );
};

export default PaymentTracking;
