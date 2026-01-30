import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export interface PaymentRecord {
  id: string;
  invoice_number: string;
  invoice_date: string;
  contractor_name: string | null;
  vendor_id: string | null;
  folder_name: string;
  interview_id: string | null;
  audit_id: string | null;
  payment_type: "new_payment" | "addition" | "deduction";
  names_count: number;
  pay_rate: number | null;
  amount: number | null;
  journey_status: string | null;
  booklet_printed_at: string | null;
  booklet_received_at: string | null;
  booklet_delivered_at: string | null;
  created_at: string;
  created_by: string | null;
  invoice_file_url: string | null;
}

export interface BudgetStats {
  totalPaid: number;
  totalAdditions: number;
  totalDeductions: number;
  balance: number;
  unmatchedCount: number;
}

export interface EnrichedPaymentRecord extends PaymentRecord {
  audit?: {
    id: string;
    file_name: string;
    status: string;
    reviewed_at: string | null;
  } | null;
  assignment?: {
    id: string;
    team_id: string;
    assigned_at: string | null;
    entry_status: string | null;
  } | null;
  metadata?: {
    interviewer_code: string | null;
    contractor_id: string | null;
    total_names: number | null;
  } | null;
}

export const usePaymentRecords = (contractorId?: string) => {
  return useQuery({
    queryKey: ["payment-records", contractorId],
    queryFn: async () => {
      let query = supabase
        .from("payment_records")
        .select("*")
        .order("created_at", { ascending: false });

      // Note: We'll filter by contractor after fetching since we need to join with metadata
      const { data, error } = await query;

      if (error) throw error;
      return data as PaymentRecord[];
    },
  });
};

export const useEnrichedPaymentRecords = (contractorId?: string) => {
  const { data: paymentRecords, isLoading: recordsLoading } = usePaymentRecords();
  
  return useQuery({
    queryKey: ["enriched-payment-records", contractorId, paymentRecords?.length],
    queryFn: async () => {
      if (!paymentRecords || paymentRecords.length === 0) return [];

      // Get unique folder names
      const folderNames = [...new Set(paymentRecords.map(p => p.folder_name))];
      
      // Get audit IDs that exist
      const auditIds = paymentRecords
        .filter(p => p.audit_id)
        .map(p => p.audit_id as string);

      // Batch fetch audits
      const { data: audits } = await supabase
        .from("audits")
        .select("id, file_name, status, reviewed_at")
        .in("file_name", folderNames);

      // Batch fetch assignments for those audits
      const auditIdsForAssignments = audits?.map(a => a.id) || [];
      const { data: assignments } = await supabase
        .from("interview_assignments")
        .select("id, audit_id, team_id, assigned_at, entry_status")
        .in("audit_id", auditIdsForAssignments);

      // Batch fetch metadata
      const { data: metadata } = await supabase
        .from("interview_metadata")
        .select("audit_id, interviewer_code, contractor_id, total_names")
        .in("audit_id", auditIdsForAssignments);

      // Create lookup maps
      const auditByFileName = new Map(audits?.map(a => [a.file_name, a]) || []);
      const assignmentByAuditId = new Map(assignments?.map(a => [a.audit_id, a]) || []);
      const metadataByAuditId = new Map(metadata?.map(m => [m.audit_id, m]) || []);

      // Enrich payment records
      let enriched = paymentRecords.map(record => {
        const audit = auditByFileName.get(record.folder_name);
        return {
          ...record,
          audit: audit || null,
          assignment: audit ? assignmentByAuditId.get(audit.id) || null : null,
          metadata: audit ? metadataByAuditId.get(audit.id) || null : null,
        } as EnrichedPaymentRecord;
      });

      // Filter by contractor if specified
      if (contractorId) {
        enriched = enriched.filter(r => 
          r.metadata?.contractor_id === contractorId || 
          r.contractor_name?.includes(contractorId)
        );
      }

      return enriched;
    },
    enabled: !!paymentRecords && paymentRecords.length > 0,
  });
};

export const useBudgetStats = (contractorId?: string) => {
  const { data: records } = usePaymentRecords(contractorId);

  return useQuery({
    queryKey: ["budget-stats", contractorId, records?.length],
    queryFn: async (): Promise<BudgetStats> => {
      if (!records) return { totalPaid: 0, totalAdditions: 0, totalDeductions: 0, balance: 0, unmatchedCount: 0 };

      const newPayments = records.filter(r => r.payment_type === "new_payment");
      const additions = records.filter(r => r.payment_type === "addition");
      const deductions = records.filter(r => r.payment_type === "deduction");

      const totalPaid = newPayments.reduce((sum, r) => sum + r.names_count, 0);
      const totalAdditions = additions.reduce((sum, r) => sum + r.names_count, 0);
      const totalDeductions = deductions.reduce((sum, r) => sum + r.names_count, 0);
      const unmatchedCount = records.filter(r => !r.audit_id).length;

      return {
        totalPaid: totalPaid + totalAdditions,
        totalAdditions,
        totalDeductions,
        balance: totalPaid + totalAdditions - totalDeductions,
        unmatchedCount,
      };
    },
    enabled: !!records,
  });
};

export const useUpdateJourneyStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      recordId, 
      field, 
      value 
    }: { 
      recordId: string; 
      field: "booklet_printed_at" | "booklet_received_at" | "booklet_delivered_at";
      value: string | null;
    }) => {
      const { error } = await supabase
        .from("payment_records")
        .update({ [field]: value })
        .eq("id", recordId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-records"] });
      queryClient.invalidateQueries({ queryKey: ["enriched-payment-records"] });
      toast.success("Journey status updated");
    },
    onError: (error) => {
      console.error("Update journey error:", error);
      toast.error("Failed to update journey status");
    },
  });
};

export const useInvoices = () => {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_records")
        .select("invoice_number, invoice_date, contractor_name")
        .order("invoice_date", { ascending: false });

      if (error) throw error;

      // Get unique invoices
      const invoiceMap = new Map<string, { invoice_number: string; invoice_date: string; contractor_name: string | null }>();
      data?.forEach(r => {
        if (!invoiceMap.has(r.invoice_number)) {
          invoiceMap.set(r.invoice_number, r);
        }
      });

      return Array.from(invoiceMap.values());
    },
  });
};
