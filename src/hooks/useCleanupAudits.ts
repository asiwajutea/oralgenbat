import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CleanableAudit {
  audit_id: string;
  file_name: string;
  status: string;
  reviewed_at: string;
  mobile_zip_uploaded_at: string;
  zip_url: string;
  photo_count: number;
  has_metadata: boolean;
  days_since_review: number;
}

export function useCleanableAudits(minAgeDays: number = 30, contractorFilter?: string) {
  return useQuery({
    queryKey: ['cleanable-audits', minAgeDays, contractorFilter],
    queryFn: async (): Promise<CleanableAudit[]> => {
      const { data, error } = await supabase.rpc('get_cleanable_audit_files', {
        min_age_days: minAgeDays,
        contractor_filter: contractorFilter || null
      });

      if (error) {
        console.error('Error fetching cleanable audits:', error);
        throw error;
      }

      return data || [];
    },
    refetchOnWindowFocus: false,
  });
}

interface DeleteAuditFilesParams {
  auditIds: string[];
  deleteZips: boolean;
  deletePhotos: boolean;
}

interface CleanupSummary {
  auditsProcessed: number;
  zipsDeleted: number;
  photosDeleted: number;
  spaceFeedMb: number;
  errors: string[];
}

export function useDeleteAuditFiles() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ auditIds, deleteZips, deletePhotos }: DeleteAuditFilesParams): Promise<CleanupSummary> => {
      const { data, error } = await supabase.functions.invoke('cleanup-audit-files', {
        body: { auditIds, deleteZips, deletePhotos }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Cleanup failed');
      }

      return data.summary;
    },
    onSuccess: (summary) => {
      // Invalidate storage usage and cleanable audits queries
      queryClient.invalidateQueries({ queryKey: ['storage-usage'] });
      queryClient.invalidateQueries({ queryKey: ['cleanable-audits'] });

      // Show success toast
      toast({
        title: 'Cleanup Complete',
        description: `Deleted ${summary.zipsDeleted} ZIP files and ${summary.photosDeleted} photos. Freed ${summary.spaceFeedMb.toFixed(1)} MB.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Cleanup Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  });
}
