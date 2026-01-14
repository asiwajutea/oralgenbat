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
      
      // Use RPC function to get storage usage from storage.objects
      const { data: bucketData, error } = await supabase
        .rpc('get_storage_usage');

      if (error) {
        console.error('Error fetching storage usage:', error);
        throw error;
      }

      // Initialize all buckets with zero
      const bucketMap = new Map<string, { count: number; bytes: number }>();
      buckets.forEach(bucket => {
        bucketMap.set(bucket, { count: 0, bytes: 0 });
      });

      // Map the RPC results to our bucket map
      bucketData?.forEach((row: any) => {
        bucketMap.set(row.bucket_id, {
          count: row.file_count,
          bytes: row.total_size_bytes
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
      const formattedBuckets: StorageBucketUsage[] = Array.from(bucketMap.entries()).map(([bucketId, { count, bytes }]) => ({
        bucket_id: bucketId,
        file_count: count,
        total_size_bytes: bytes,
        total_size_mb: bytes / (1024 * 1024),
        total_size_gb: bytes / (1024 * 1024 * 1024),
        percentage_of_total: totalBytes > 0 ? (bytes / totalBytes) * 100 : 0
      }));

      // Sort by size descending
      formattedBuckets.sort((a, b) => b.total_size_bytes - a.total_size_bytes);

      return {
        buckets: formattedBuckets,
        total_files: totalFiles,
        total_size_bytes: totalBytes,
        total_size_mb: totalMb,
        total_size_gb: totalGb,
        percentage_used: percentageUsed,
        storage_limit_gb: STORAGE_LIMIT_GB
      };
    },
    // Removed refetchInterval - data only refreshes on manual refresh
    staleTime: Infinity, // Data stays fresh until manually refreshed
  });
};
