import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { HardDrive, Trash2 } from "lucide-react";
import { StorageUsageSummary } from "@/hooks/useStorageUsage";
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

  const { total_size_mb, total_size_gb, total_files } = data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Storage Usage</CardTitle>
        <HardDrive className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="text-2xl font-bold">
            {total_size_gb >= 0.1
              ? `${total_size_gb.toFixed(2)} GB`
              : `${total_size_mb.toFixed(1)} MB`
            }
          </div>
          <p className="text-xs text-muted-foreground">
            {total_files.toLocaleString()} files
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs"
          onClick={() => setCleanupDialogOpen(true)}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Cleanup Old Files
        </Button>
      </CardContent>

      <StorageCleanupDialog
        open={cleanupDialogOpen}
        onOpenChange={setCleanupDialogOpen}
        currentUsageMb={total_size_mb}
      />
    </Card>
  );
};
