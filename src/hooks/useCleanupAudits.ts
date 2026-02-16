import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

export interface BatchProgress {
  phase: 'idle' | 'deleting' | 'done' | 'error';
  processed: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
  zipsDeleted: number;
  photosDeleted: number;
  errors: string[];
}

function splitIntoChunks<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function useBatchDeleteAuditFiles() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [progress, setProgress] = useState<BatchProgress>({
    phase: 'idle',
    processed: 0,
    total: 0,
    currentBatch: 0,
    totalBatches: 0,
    zipsDeleted: 0,
    photosDeleted: 0,
    errors: [],
  });

  const execute = useCallback(async (auditIds: string[], deleteZips: boolean, deletePhotos: boolean) => {
    const BATCH_SIZE = 25;
    const chunks = splitIntoChunks(auditIds, BATCH_SIZE);

    setProgress({
      phase: 'deleting',
      processed: 0,
      total: auditIds.length,
      currentBatch: 0,
      totalBatches: chunks.length,
      zipsDeleted: 0,
      photosDeleted: 0,
      errors: [],
    });

    let totalZips = 0;
    let totalPhotos = 0;
    const allErrors: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      try {
        const { data, error } = await supabase.functions.invoke('cleanup-audit-files', {
          body: { auditIds: chunks[i], deleteZips, deletePhotos }
        });

        if (error) {
          allErrors.push(`Batch ${i + 1}: ${error.message}`);
        } else if (data?.success) {
          totalZips += data.summary.zipsDeleted || 0;
          totalPhotos += data.summary.photosDeleted || 0;
          if (data.summary.errors?.length) {
            allErrors.push(...data.summary.errors);
          }
        } else {
          allErrors.push(`Batch ${i + 1}: ${data?.error || 'Unknown error'}`);
        }
      } catch (err) {
        allErrors.push(`Batch ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
      }

      const processed = Math.min((i + 1) * BATCH_SIZE, auditIds.length);
      setProgress({
        phase: 'deleting',
        processed,
        total: auditIds.length,
        currentBatch: i + 1,
        totalBatches: chunks.length,
        zipsDeleted: totalZips,
        photosDeleted: totalPhotos,
        errors: allErrors,
      });
    }

    // Done
    setProgress(prev => ({ ...prev, phase: 'done' }));

    queryClient.invalidateQueries({ queryKey: ['storage-usage'] });
    queryClient.invalidateQueries({ queryKey: ['cleanable-audits'] });

    toast({
      title: 'Cleanup Complete',
      description: `Deleted ${totalZips} ZIP files and ${totalPhotos} photos.`,
    });
  }, [queryClient, toast]);

  const reset = useCallback(() => {
    setProgress({
      phase: 'idle',
      processed: 0,
      total: 0,
      currentBatch: 0,
      totalBatches: 0,
      zipsDeleted: 0,
      photosDeleted: 0,
      errors: [],
    });
  }, []);

  return { progress, execute, reset };
}
