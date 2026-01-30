import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export interface Team {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  is_active: boolean;
}

export interface UnassignedInterview {
  id: string;
  file_name: string;
  reviewed_at: string;
  interviewer_code: string | null;
  contractor_id: string | null;
  total_names: number;
}

export interface Assignment {
  id: string;
  audit_id: string;
  team_id: string;
  assigned_by: string | null;
  assigned_at: string;
  total_names: number | null;
  notes: string | null;
  typing_status: 'typing_in_progress' | 'typing_completed';
  typing_completed_at: string | null;
  entry_status: string | null;
  entry_completed_at: string | null;
  entry_completed_by: string | null;
  is_flagged_for_issue: boolean | null;
  issue_comment: string | null;
  flagged_by: string | null;
  flagged_at: string | null;
  issue_resolved_at: string | null;
  issue_resolved_by: string | null;
  audit?: {
    id: string;
    file_name: string;
  };
  team?: {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
  };
}

// Helper function to batch queries to avoid 400 Bad Request errors
const BATCH_SIZE = 200;

async function batchedInQuery<T>(
  ids: string[],
  queryFn: (batch: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  if (ids.length === 0) return [];
  
  const results: T[] = [];
  
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const response = await queryFn(batch);
    
    if (response.error) {
      console.error("Batch query error:", response.error);
      // Continue with other batches instead of throwing
    }
    
    if (response.data) {
      results.push(...response.data);
    }
  }
  
  return results;
}

export const useTeams = () => {
  return useQuery({
    queryKey: ["data-entry-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_entry_teams")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data as Team[];
    },
  });
};

export const useUnassignedInterviews = () => {
  return useQuery({
    queryKey: ["unassigned-interviews"],
    queryFn: async () => {
      // Get all passed audits
      const { data: passedAudits, error: auditsError } = await supabase
        .from("audits")
        .select("id, file_name, reviewed_at")
        .eq("status", "Audit Passed")
        .order("reviewed_at", { ascending: false });

      if (auditsError) throw auditsError;

      // Get all already assigned audit IDs
      const { data: assignments, error: assignError } = await supabase
        .from("interview_assignments")
        .select("audit_id");

      if (assignError) throw assignError;

      const assignedIds = new Set(assignments?.map((a) => a.audit_id) || []);

      // Filter unassigned
      const unassignedAuditIds = passedAudits
        ?.filter((a) => !assignedIds.has(a.id))
        .map((a) => a.id) || [];

      if (unassignedAuditIds.length === 0) {
        return [];
      }

      // Get metadata for unassigned audits using batched queries
      const metadata = await batchedInQuery<{
        audit_id: string;
        interviewer_code: string | null;
        contractor_id: string | null;
        total_names: number | null;
      }>(unassignedAuditIds, (batch) =>
        supabase
          .from("interview_metadata")
          .select("audit_id, interviewer_code, contractor_id, total_names")
          .in("audit_id", batch)
      );

      const metaMap = new Map(metadata.map((m) => [m.audit_id, m]));

      // Combine data
      return passedAudits
        ?.filter((a) => !assignedIds.has(a.id))
        .map((audit) => {
          const meta = metaMap.get(audit.id);
          return {
            id: audit.id,
            file_name: audit.file_name,
            reviewed_at: audit.reviewed_at,
            interviewer_code: meta?.interviewer_code || null,
            contractor_id: meta?.contractor_id || null,
            total_names: meta?.total_names || 0,
          };
        }) as UnassignedInterview[];
    },
  });
};

export const useAssignments = () => {
  return useQuery({
    queryKey: ["interview-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interview_assignments")
        .select(`
          *,
          data_entry_teams (id, name, description, is_active)
        `)
        .order("assigned_at", { ascending: false });

      if (error) throw error;

      // Get audit details for each assignment using batched queries
      const auditIds = data?.map((a) => a.audit_id) || [];
      if (auditIds.length === 0) return [];

      const audits = await batchedInQuery<{ id: string; file_name: string }>(
        auditIds,
        (batch) =>
          supabase
            .from("audits")
            .select("id, file_name")
            .in("id", batch)
      );

      const auditMap = new Map(audits.map((a) => [a.id, a]));

      return data?.map((assignment) => ({
        ...assignment,
        typing_status: assignment.typing_status || 'typing_in_progress',
        audit: auditMap.get(assignment.audit_id),
        team: assignment.data_entry_teams,
      })) as Assignment[];
    },
  });
};

export const useCreateTeam = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const { data, error } = await supabase
        .from("data_entry_teams")
        .insert({
          name,
          description: description || null,
          created_by: session?.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-entry-teams"] });
      toast.success("Team created successfully");
    },
    onError: (error) => {
      console.error("Error creating team:", error);
      toast.error("Failed to create team");
    },
  });
};

export const useAssignInterviews = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (assignments: { auditId: string; teamId: string; totalNames: number }[]) => {
      const insertData = assignments.map((a) => ({
        audit_id: a.auditId,
        team_id: a.teamId,
        assigned_by: session?.user?.id,
        total_names: a.totalNames,
        typing_status: 'typing_in_progress',
      }));

      const { error } = await supabase.from("interview_assignments").insert(insertData);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unassigned-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["interview-assignments"] });
      toast.success("Interviews assigned successfully");
    },
    onError: (error) => {
      console.error("Error assigning interviews:", error);
      toast.error("Failed to assign interviews");
    },
  });
};

export const useUnassignInterview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from("interview_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unassigned-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["interview-assignments"] });
      toast.success("Interview unassigned successfully");
    },
    onError: (error) => {
      console.error("Error unassigning interview:", error);
      toast.error("Failed to unassign interview");
    },
  });
};

export const useUpdateTypingStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assignmentId, status }: { assignmentId: string; status: 'typing_in_progress' | 'typing_completed' }) => {
      const updateData: Record<string, unknown> = {
        typing_status: status,
      };
      
      if (status === 'typing_completed') {
        updateData.typing_completed_at = new Date().toISOString();
      } else {
        updateData.typing_completed_at = null;
      }

      const { error } = await supabase
        .from("interview_assignments")
        .update(updateData)
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interview-assignments"] });
      toast.success("Status updated successfully");
    },
    onError: (error) => {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    },
  });
};

export const useDeleteTeam = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await supabase
        .from("data_entry_teams")
        .update({ is_active: false })
        .eq("id", teamId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-entry-teams"] });
      toast.success("Team deleted successfully");
    },
    onError: (error) => {
      console.error("Error deleting team:", error);
      toast.error("Failed to delete team");
    },
  });
};

// Bulk mark assignments as complete
export const useBulkMarkComplete = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (assignmentIds: string[]) => {
      const { error } = await supabase
        .from("interview_assignments")
        .update({
          entry_status: "data_entry_complete",
          entry_completed_by: session?.user?.id,
          entry_completed_at: new Date().toISOString(),
        })
        .in("id", assignmentIds);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["interview-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["data-entry-stats"] });
      toast.success(`${variables.length} interviews marked as complete`);
    },
    onError: (error) => {
      console.error("Error marking complete:", error);
      toast.error("Failed to mark interviews as complete");
    },
  });
};

// Undo completion (reset entry status)
export const useUndoCompletion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from("interview_assignments")
        .update({
          entry_status: "typing_in_progress",
          entry_completed_by: null,
          entry_completed_at: null,
        })
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interview-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["completions"] });
      queryClient.invalidateQueries({ queryKey: ["data-entry-stats"] });
      toast.success("Completion undone");
    },
    onError: (error) => {
      console.error("Error undoing completion:", error);
      toast.error("Failed to undo completion");
    },
  });
};

// Flag interview for issue
export const useFlagForIssue = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ assignmentId, comment }: { assignmentId: string; comment: string }) => {
      const { error } = await supabase
        .from("interview_assignments")
        .update({
          is_flagged_for_issue: true,
          issue_comment: comment,
          flagged_by: session?.user?.id,
          flagged_at: new Date().toISOString(),
        })
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interview-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["data-entry-search"] });
      toast.success("Interview flagged for issue");
    },
    onError: (error) => {
      console.error("Error flagging issue:", error);
      toast.error("Failed to flag issue");
    },
  });
};

// Resolve issue
export const useResolveIssue = () => {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ assignmentId, comment }: { assignmentId: string; comment?: string }) => {
      const { error } = await supabase
        .from("interview_assignments")
        .update({
          issue_resolved_at: new Date().toISOString(),
          issue_resolved_by: session?.user?.id,
          resolve_comment: comment || null,
          is_flagged_for_issue: false, // Reset flag status
        })
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interview-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["resolved-issues"] });
      toast.success("Issue marked as resolved");
    },
    onError: (error) => {
      console.error("Error resolving issue:", error);
      toast.error("Failed to resolve issue");
    },
  });
};

export interface ExportBatch {
  id: string;
  team_id: string;
  export_batch_id: string;
  exported_at: string;
  exported_by: string | null;
  total_files: number;
  total_names: number;
  file_names: string[];
}

export const useExportBatches = (teamId?: string) => {
  return useQuery({
    queryKey: ["team-export-batches", teamId],
    queryFn: async () => {
      let query = supabase
        .from("team_export_batches")
        .select("*")
        .order("exported_at", { ascending: false });

      if (teamId) {
        query = query.eq("team_id", teamId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as ExportBatch[];
    },
    enabled: true,
  });
};
