import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface StatusCounts {
  Pending: number;
  "Audit Passed": number;
  "Audit Failed": number;
  "Awaiting Review": number;
  "In Progress": number;
  "Re-Audit": number;
}

interface TotalNames {
  Pending: number;
  "Audit Passed": number;
  "Audit Failed": number;
  "Awaiting Review": number;
  "In Progress": number;
  "Re-Audit": number;
}

export const useStatusCounts = () => {
  const { userRole, profile } = useAuth();
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isAuditor = userRole === 'auditor';
  const isContractor = userRole === 'contractor';
  const isFieldManager = userRole === 'field_manager';
  const isSubContractor = userRole === 'sub_contractor';
  
  // Auditors MUST use active_contractor_id to filter
  // Contractors and Sub-contractors use their contractor_id
  // Field managers need separate handling (by team members)
  const effectiveContractorId = isAuditor 
    ? profile?.active_contractor_id  // Auditors only filter when they have active_contractor_id
    : (profile?.active_contractor_id || profile?.contractor_id);  // Others use active or fallback to contractor_id

  return useQuery({
    queryKey: ["status-counts", userRole, profile?.full_name, effectiveContractorId],
    queryFn: async (): Promise<{ counts: StatusCounts; totalNames: TotalNames }> => {
      // Get all audits with their metadata for total_names and contractor filtering
      const { data: audits, error } = await supabase
        .from("audits")
        .select(`
          status, 
          locked_by, 
          locked_at,
          is_re_audit,
          reviewed_by,
          file_url,
          file_name,
          mobile_zip_url,
          interview_metadata(total_names, contractor_id)
        `);

      if (error) throw error;

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const counts: StatusCounts = {
        Pending: 0,
        "Audit Passed": 0,
        "Audit Failed": 0,
        "Awaiting Review": 0,
        "In Progress": 0,
        "Re-Audit": 0,
      };

      const totalNames: TotalNames = {
        Pending: 0,
        "Audit Passed": 0,
        "Audit Failed": 0,
        "Awaiting Review": 0,
        "In Progress": 0,
        "Re-Audit": 0,
      };

      audits?.forEach((audit) => {
        const metadata = audit.interview_metadata as { total_names: number | null; contractor_id: string | null }[] | null;
        const hasMetadata = metadata && metadata.length > 0;
        const names = metadata?.[0]?.total_names || 0;
        const auditContractorId = metadata?.[0]?.contractor_id || null;
        
        // Extract contractor_id from file_name for audits without metadata (format: NG71_711_20251208_0937)
        const fileNameParts = audit.file_name?.split('_') || [];
        const contractorIdFromFileName = fileNameParts[0] || null;
        const effectiveAuditContractorId = auditContractorId || contractorIdFromFileName;
        
        // For contractors, sub-contractors, and auditors with active_contractor_id, skip audits that don't belong to them
        if ((isContractor || isSubContractor || (isAuditor && profile?.active_contractor_id)) && effectiveContractorId && effectiveAuditContractorId !== effectiveContractorId) {
          return;
        }
        
        // Complete artifacts = has PDF AND has successfully extracted metadata (not just ZIP URL)
        // This excludes corrupted ZIPs where the ZIP was uploaded but processing failed
        const hasCompleteArtifacts = !!audit.file_url && hasMetadata;
        
        // Count as "In Progress" if locked and within 1 hour
        if (audit.locked_by && audit.locked_at && audit.locked_at > oneHourAgo) {
          counts["In Progress"]++;
          totalNames["In Progress"] += names;
        }
        
        // Handle re-audits separately
        if (audit.is_re_audit && audit.status === "Awaiting Review") {
          // For auditors, only count their own re-audits
          if (isAuditor && profile?.full_name) {
            if (audit.reviewed_by === profile.full_name) {
              counts["Re-Audit"]++;
              totalNames["Re-Audit"] += names;
            }
          } else if (isAdmin) {
            // Admins see all re-audits
            counts["Re-Audit"]++;
            totalNames["Re-Audit"] += names;
          }
          // Skip adding to Pending count for re-audits
          return;
        }
        
        // Count regular statuses (exclude re-audits from Pending/Awaiting Review)
        if (audit.status === "Pending" || audit.status === "Awaiting Review") {
          // For auditors, only count items with complete artifacts
          if (isAuditor) {
            if (hasCompleteArtifacts) {
              counts["Pending"]++;
              totalNames["Pending"] += names;
            }
          } else {
            counts["Pending"]++;
            totalNames["Pending"] += names;
          }
        } else if (counts[audit.status as keyof StatusCounts] !== undefined) {
          counts[audit.status as keyof StatusCounts]++;
          totalNames[audit.status as keyof StatusCounts] += names;
        }
      });

      return { counts, totalNames };
    },
  });
};
