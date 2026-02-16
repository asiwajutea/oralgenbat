import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BATCH_SIZE = 200;

// Helper function for batched queries
async function batchedInQuery<T>(
  ids: string[],
  queryFn: (batch: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  if (ids.length === 0) return [];
  
  const results: T[] = [];
  const batches: string[][] = [];
  
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    batches.push(ids.slice(i, i + BATCH_SIZE));
  }
  
  const batchResults = await Promise.all(batches.map(queryFn));
  
  for (const result of batchResults) {
    if (result.data) {
      results.push(...result.data);
    }
  }
  
  return results;
}

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

// New unified interface for all interviews
export interface PaymentInterviewRecord {
  id: string;
  file_name: string;
  status: string;
  reviewed_at: string | null;
  total_names: number | null;
  interviewer_code: string | null;
  contractor_id: string | null;
  interviewee_name: string | null;
  assignment: {
    id: string;
    team_id: string;
    team_name: string | null;
    assigned_at: string | null;
    entry_status: string | null;
  } | null;
  payment: {
    id: string;
    invoice_number: string;
    payment_type: string;
    names_count: number;
    amount: number | null;
    booklet_printed_at: string | null;
    booklet_received_at: string | null;
    booklet_delivered_at: string | null;
  } | null;
}

// Legacy interface for backward compatibility
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

// NEW: Hook to fetch all interviews with payment data
export const useAllInterviewsForPayment = (contractorId?: string) => {
  return useQuery({
    queryKey: ["all-interviews-payment", contractorId],
    queryFn: async (): Promise<PaymentInterviewRecord[]> => {
      // 1. Fetch all audits
      const { data: audits, error: auditsError } = await supabase
        .from("audits")
        .select("id, file_name, status, reviewed_at")
        .order("uploaded_at", { ascending: false });

      if (auditsError) throw auditsError;
      if (!audits || audits.length === 0) return [];

      const auditIds = audits.map(a => a.id);
      const folderNames = audits.map(a => a.file_name);

      // 2. Batch fetch metadata
      const metadata = await batchedInQuery(
        auditIds,
        (batch) => supabase
          .from("interview_metadata")
          .select("audit_id, total_names, interviewer_code, contractor_id, interviewee_name")
          .in("audit_id", batch)
      );
      const metadataMap = new Map(metadata.map(m => [m.audit_id, m]));

      // 3. Batch fetch assignments with team names
      const assignments = await batchedInQuery(
        auditIds,
        (batch) => supabase
          .from("interview_assignments")
          .select("id, audit_id, team_id, assigned_at, entry_status")
          .in("audit_id", batch)
      );
      
      // Get team names
      const teamIds = [...new Set(assignments.map(a => a.team_id))];
      const { data: teams } = await supabase
        .from("data_entry_teams")
        .select("id, name")
        .in("id", teamIds);
      const teamMap = new Map(teams?.map(t => [t.id, t.name]) || []);
      
      const assignmentMap = new Map(assignments.map(a => [a.audit_id, {
        ...a,
        team_name: teamMap.get(a.team_id) || null
      }]));

      // 4. Batch fetch payment records by folder_name
      const payments = await batchedInQuery(
        folderNames,
        (batch) => supabase
          .from("payment_records")
          .select("id, folder_name, invoice_number, payment_type, names_count, amount, booklet_printed_at, booklet_received_at, booklet_delivered_at")
          .in("folder_name", batch)
      );
      const paymentMap = new Map(payments.map(p => [p.folder_name, p]));

      // 5. Combine all data
      let records: PaymentInterviewRecord[] = audits.map(audit => {
        const meta = metadataMap.get(audit.id);
        const assignment = assignmentMap.get(audit.id);
        const payment = paymentMap.get(audit.file_name);

        return {
          id: audit.id,
          file_name: audit.file_name,
          status: audit.status,
          reviewed_at: audit.reviewed_at,
          total_names: meta?.total_names || null,
          interviewer_code: meta?.interviewer_code || null,
          contractor_id: meta?.contractor_id || null,
          interviewee_name: meta?.interviewee_name || null,
          assignment: assignment ? {
            id: assignment.id,
            team_id: assignment.team_id,
            team_name: assignment.team_name,
            assigned_at: assignment.assigned_at,
            entry_status: assignment.entry_status
          } : null,
          payment: payment ? {
            id: payment.id,
            invoice_number: payment.invoice_number,
            payment_type: payment.payment_type,
            names_count: payment.names_count,
            amount: payment.amount,
            booklet_printed_at: payment.booklet_printed_at,
            booklet_received_at: payment.booklet_received_at,
            booklet_delivered_at: payment.booklet_delivered_at
          } : null
        };
      });

      // 6. Apply contractor filter if specified
      if (contractorId) {
        records = records.filter(r => r.contractor_id === contractorId);
      }

      return records;
    },
  });
};

export const usePaymentRecords = (contractorId?: string) => {
  return useQuery({
    queryKey: ["payment-records", contractorId],
    queryFn: async () => {
      let query = supabase
        .from("payment_records")
        .select("*")
        .order("created_at", { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      return data as PaymentRecord[];
    },
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
      queryClient.invalidateQueries({ queryKey: ["all-interviews-payment"] });
      toast.success("Journey status updated");
    },
    onError: (error) => {
      console.error("Update journey error:", error);
      toast.error("Failed to update journey status");
    },
  });
};

// NEW: Create or update payment status for an interview
export const useCreateOrUpdatePaymentStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      auditId, 
      folderName, 
      paymentType,
      namesCount,
      contractorId
    }: {
      auditId: string;
      folderName: string;
      paymentType: "new_payment" | "deduction" | "addition";
      namesCount: number;
      contractorId?: string;
    }) => {
      // Check if payment record exists for this folder
      const { data: existing } = await supabase
        .from("payment_records")
        .select("id")
        .eq("folder_name", folderName)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from("payment_records")
          .update({ payment_type: paymentType })
          .eq("id", existing.id);
        
        if (error) throw error;
      } else {
        // Create new record
        const { error } = await supabase
          .from("payment_records")
          .insert({
            folder_name: folderName,
            audit_id: auditId,
            payment_type: paymentType,
            names_count: namesCount || 0,
            invoice_number: `MANUAL-${Date.now()}`,
            invoice_date: new Date().toISOString().split('T')[0],
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-records"] });
      queryClient.invalidateQueries({ queryKey: ["all-interviews-payment"] });
      queryClient.invalidateQueries({ queryKey: ["budget-stats"] });
    },
    onError: (error) => {
      console.error("Create/update payment error:", error);
      throw error;
    },
  });
};

// NEW: Bulk create payment records for manual entry
export const useBulkCreatePayments = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      entries 
    }: {
      entries: Array<{
        folder_name: string;
        audit_id: string | null;
        names_count: number;
        payment_type: "new_payment" | "addition" | "deduction";
        invoice_number: string;
      }>;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const records = entries.map(e => ({
        ...e,
        invoice_date: new Date().toISOString().split('T')[0],
        created_by: user?.id,
      }));
      
      const { error } = await supabase
        .from("payment_records")
        .insert(records);
        
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-records"] });
      queryClient.invalidateQueries({ queryKey: ["all-interviews-payment"] });
      queryClient.invalidateQueries({ queryKey: ["budget-stats"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error) => {
      console.error("Bulk create payments error:", error);
      throw error;
    },
  });
};

export const useUpdatePaymentRecord = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      recordId, 
      updates 
    }: { 
      recordId: string; 
      updates: { names_count?: number; payment_type?: string };
    }) => {
      const { error } = await supabase
        .from("payment_records")
        .update(updates)
        .eq("id", recordId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-records"] });
      queryClient.invalidateQueries({ queryKey: ["all-interviews-payment"] });
      queryClient.invalidateQueries({ queryKey: ["budget-stats"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Payment record updated");
    },
    onError: (error) => {
      console.error("Update payment record error:", error);
      toast.error("Failed to update payment record");
    },
  });
};

export const useDeletePaymentRecord = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase
        .from("payment_records")
        .delete()
        .eq("id", recordId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-records"] });
      queryClient.invalidateQueries({ queryKey: ["all-interviews-payment"] });
      queryClient.invalidateQueries({ queryKey: ["budget-stats"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Payment record deleted");
    },
    onError: (error) => {
      console.error("Delete payment record error:", error);
      toast.error("Failed to delete payment record");
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
