import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { HardDrive, AlertTriangle, Trash2 } from "lucide-react";
import { StorageUsageSummary } from "@/hooks/useStorageUsage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StorageCleanupDialog } from "./StorageCleanupDialog";

interface StorageUsageCardProps {
  data?: StorageUsageSummary;
  loading?: boolean;
}

export const StorageUsageCard = ({ data, loading }: StorageUsageCardProps) => {
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);

  if (loading || !data) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Storage Usage</CardTitle>
          <HardDrive className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const { total_size_mb, total_size_gb, percentage_used, storage_limit_gb, total_files } = data;
  
  // Determine color based on usage
  const getProgressColor = () => {
    if (percentage_used >= 90) return "bg-destructive";
    if (percentage_used >= 80) return "bg-warning";
    return "bg-success";
  };

  const showWarning = percentage_used >= 80;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Storage Usage</CardTitle>
        <HardDrive className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold">
              {total_size_gb >= 0.1 
                ? `${total_size_gb.toFixed(2)} GB`
                : `${total_size_mb.toFixed(1)} MB`
              }
            </div>
            <span className="text-sm text-muted-foreground">
              of {storage_limit_gb} GB
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {total_files} files • {percentage_used.toFixed(1)}% used
          </p>
        </div>
        
        <Progress 
          value={percentage_used} 
          className="h-2"
          indicatorClassName={getProgressColor()}
        />

        {showWarning && (
          <Alert variant={percentage_used >= 90 ? "destructive" : "default"} className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p className="text-xs">
                {percentage_used >= 90 
                  ? "Storage almost full! Clean up old files to free space."
                  : "Storage usage high. Consider cleaning up old files from passed audits."
                }
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => setCleanupDialogOpen(true)}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Cleanup Old Files
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <StorageCleanupDialog
        open={cleanupDialogOpen}
        onOpenChange={setCleanupDialogOpen}
        currentUsageMb={total_size_mb}
      />
    </Card>
  );
};
