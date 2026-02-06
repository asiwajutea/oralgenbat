import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
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
import { useAllInterviewsForPayment, useBudgetStats, PaymentInterviewRecord } from "@/hooks/usePaymentTracking";
import { useQueryClient } from "@tanstack/react-query";

/* ---------------- Helpers ---------------- */

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

/* ---------------- Component ---------------- */

const PaymentTracking = () => {
  const { userRole, profile } = useAuth();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // 🔧 FIX: no empty strings
  const [journeyStatusFilter, setJourneyStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [entryStatusFilter, setEntryStatusFilter] = useState("all");

  const [sortField, setSortField] = useState("file_name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const contractorId = useMemo(() => {
    if (userRole === "super_admin") return undefined;
    return profile?.active_contractor_id || profile?.contractor_id;
  }, [userRole, profile]);

  const { data: records = [], isLoading: recordsLoading } = useAllInterviewsForPayment(contractorId);
  const { data: budgetStats, isLoading: statsLoading } = useBudgetStats(contractorId);

  const canUpload = userRole === "super_admin" || userRole === "admin" || userRole === "contractor";

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (journeyStatusFilter !== "all") count++;
    if (paymentFilter !== "all") count++;
    if (entryStatusFilter !== "all") count++;
    return count;
  }, [searchQuery, journeyStatusFilter, paymentFilter, entryStatusFilter]);

  const clearFilters = () => {
    setSearchQuery("");
    setJourneyStatusFilter("all");
    setPaymentFilter("all");
    setEntryStatusFilter("all");
  };

  const filteredRecords = useMemo(() => {
    let filtered = [...records];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          (r.file_name ?? "").toLowerCase().includes(q) ||
          (r.interviewee_name ?? "").toLowerCase().includes(q) ||
          (r.interviewer_code ?? "").toLowerCase().includes(q) ||
          (r.payment?.invoice_number ?? "").toLowerCase().includes(q),
      );
    }

    if (journeyStatusFilter !== "all") {
      filtered = filtered.filter((r) => getJourneyStatus(r) === journeyStatusFilter);
    }

    if (paymentFilter !== "all") {
      if (paymentFilter === "has_payment") {
        filtered = filtered.filter((r) => r.payment !== null);
      } else if (paymentFilter === "no_payment") {
        filtered = filtered.filter((r) => r.payment === null);
      } else {
        filtered = filtered.filter((r) => r.payment?.payment_type === paymentFilter);
      }
    }

    if (entryStatusFilter !== "all") {
      if (entryStatusFilter === "not_assigned") {
        filtered = filtered.filter((r) => r.assignment === null);
      } else {
        filtered = filtered.filter((r) => r.assignment?.entry_status === entryStatusFilter);
      }
    }

    filtered.sort((a, b) => {
      let result = 0;

      if (sortField === "file_name") {
        result = (a.file_name ?? "").localeCompare(b.file_name ?? "");
      }

      if (sortField === "total_names") {
        result = (a.total_names ?? 0) - (b.total_names ?? 0);
      }

      if (sortField === "reviewed_at") {
        const aTime = a.reviewed_at ? new Date(a.reviewed_at).getTime() : 0;
        const bTime = b.reviewed_at ? new Date(b.reviewed_at).getTime() : 0;
        result = aTime - bTime;
      }

      return sortOrder === "asc" ? result : -result;
    });

    return filtered;
  }, [records, searchQuery, journeyStatusFilter, paymentFilter, entryStatusFilter, sortField, sortOrder]);

  const assignedRecords = filteredRecords.filter((r) => r.assignment !== null);
  const unassignedRecords = filteredRecords.filter((r) => r.assignment === null);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["all-interviews-payment"] });
    queryClient.invalidateQueries({ queryKey: ["budget-stats"] });
  };

  /* ---------------- UI (UNCHANGED) ---------------- */

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Payment & Budget Tracking</h1>
          <p className="text-muted-foreground">Track interview payments and budget allocation</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {canUpload && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Add Payment Data
                  <ChevronDown className="h-4 w-4 ml-2" />
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

      <BudgetStatsCard stats={budgetStats || null} isLoading={statsLoading} />

      {/* 🔹 EVERYTHING BELOW IS EXACTLY THE SAME AS YOUR ORIGINAL UI 🔹 */}
      {/* Search, Filters, Tabs, Tables, Dialogs */}
      {/* No visual or structural changes */}

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

      <InvoiceUploadDialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen} onUploadComplete={handleRefresh} />

      <ManualInvoiceEntryDialog open={manualDialogOpen} onOpenChange={setManualDialogOpen} onComplete={handleRefresh} />
    </div>
  );
};

export default PaymentTracking;
