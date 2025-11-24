import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StorageBucketUsage {
  bucket_id: string;
  file_count: number;
  total_size_bytes: number;
  total_size_mb: number;
  total_size_gb: number;
  percentage_of_total: number;
}

export interface StorageUsageSummary {
  buckets: StorageBucketUsage[];
  total_files: number;
  total_size_bytes: number;
  total_size_mb: number;
  total_size_gb: number;
  percentage_used: number;
  storage_limit_gb: number;
}

const STORAGE_LIMIT_GB = 1; // Lovable Cloud storage limit

export const useStorageUsage = () => {
  return useQuery({
    queryKey: ['storage-usage'],
    queryFn: async (): Promise<StorageUsageSummary> => {
      const buckets = ['audit-pdfs', 'mobile-zips', 'interview-photos'];
      
      // Query storage.objects table directly to get file sizes
      // @ts-ignore - storage.objects is not in the generated types but exists
      const { data: objects, error } = await supabase
        .from('storage.objects' as any)
        .select('bucket_id, metadata')
        .in('bucket_id', buckets);

      if (error) {
        console.error('Error fetching storage objects:', error);
        throw error;
      }

      // Group by bucket and calculate sizes
      const bucketMap = new Map<string, { count: number; bytes: number }>();
      
      // Initialize all buckets with zero
      buckets.forEach(bucket => {
        bucketMap.set(bucket, { count: 0, bytes: 0 });
      });

      // Aggregate sizes from objects
      objects?.forEach((obj: any) => {
        const bucketId = obj.bucket_id;
        const size = obj.metadata?.size || 0;
        const current = bucketMap.get(bucketId) || { count: 0, bytes: 0 };
        bucketMap.set(bucketId, {
          count: current.count + 1,
          bytes: current.bytes + size
        });
      });

      // Calculate totals
      let totalFiles = 0;
      let totalBytes = 0;
      
      bucketMap.forEach(({ count, bytes }) => {
        totalFiles += count;
        totalBytes += bytes;
      });

      const totalMb = totalBytes / (1024 * 1024);
      const totalGb = totalBytes / (1024 * 1024 * 1024);
      const percentageUsed = (totalGb / STORAGE_LIMIT_GB) * 100;

      // Format bucket data
      const bucketData: StorageBucketUsage[] = Array.from(bucketMap.entries()).map(([bucketId, { count, bytes }]) => ({
        bucket_id: bucketId,
        file_count: count,
        total_size_bytes: bytes,
        total_size_mb: bytes / (1024 * 1024),
        total_size_gb: bytes / (1024 * 1024 * 1024),
        percentage_of_total: totalBytes > 0 ? (bytes / totalBytes) * 100 : 0
      }));

      // Sort by size descending
      bucketData.sort((a, b) => b.total_size_bytes - a.total_size_bytes);

      return {
        buckets: bucketData,
        total_files: totalFiles,
        total_size_bytes: totalBytes,
        total_size_mb: totalMb,
        total_size_gb: totalGb,
        percentage_used: percentageUsed,
        storage_limit_gb: STORAGE_LIMIT_GB
      };
    },
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000, // Consider data stale after 30 seconds
  });
};
