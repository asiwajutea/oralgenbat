import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Database, FileText, Package, Image } from "lucide-react";
import { StorageUsageSummary } from "@/hooks/useStorageUsage";

interface StorageBreakdownProps {
  data?: StorageUsageSummary;
  loading?: boolean;
}

const bucketIcons: Record<string, React.ReactNode> = {
  'audit-pdfs': <FileText className="h-4 w-4 text-muted-foreground" />,
  'mobile-zips': <Package className="h-4 w-4 text-muted-foreground" />,
  'interview-photos': <Image className="h-4 w-4 text-muted-foreground" />
};

const bucketLabels: Record<string, string> = {
  'audit-pdfs': 'Audit PDFs',
  'mobile-zips': 'Mobile ZIPs',
  'interview-photos': 'Interview Photos'
};

export const StorageBreakdown = ({ data, loading }: StorageBreakdownProps) => {
  if (loading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Storage Breakdown
          </CardTitle>
          <CardDescription>Distribution across storage buckets</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Storage Breakdown
        </CardTitle>
        <CardDescription>Distribution across storage buckets</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.buckets.map((bucket) => (
          <div key={bucket.bucket_id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {bucketIcons[bucket.bucket_id]}
                <span className="font-medium">
                  {bucketLabels[bucket.bucket_id] || bucket.bucket_id}
                </span>
              </div>
              <span className="text-sm font-semibold">
                {bucket.total_size_mb >= 1
                  ? `${bucket.total_size_mb.toFixed(1)} MB`
                  : `${(bucket.total_size_bytes / 1024).toFixed(0)} KB`
                }
              </span>
            </div>
            
            <Progress 
              value={bucket.percentage_of_total} 
              className="h-2"
            />
            
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{bucket.file_count} files</span>
              <span>{bucket.percentage_of_total.toFixed(1)}% of total storage</span>
            </div>
          </div>
        ))}

        {data.buckets.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No files uploaded yet
          </p>
        )}
      </CardContent>
    </Card>
  );
};
