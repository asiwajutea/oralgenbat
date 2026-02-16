import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/utils/compressPdf";

export interface UploadProgressData {
  fileName: string;
  interviewName: string;
  fileSize: number;
  progress: number;
  status: "uploading" | "processing" | "success" | "error";
  errorMessage?: string;
}

interface FloatingUploadProgressProps extends UploadProgressData {
  onClose: () => void;
}

export const FloatingUploadProgress = ({
  fileName,
  interviewName,
  fileSize,
  progress,
  status,
  errorMessage,
  onClose,
}: FloatingUploadProgressProps) => {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto">
      <Card className={cn(
        "shadow-lg border-2",
        status === "success" && "border-green-500",
        status === "error" && "border-destructive",
        status !== "success" && status !== "error" && "border-primary"
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{interviewName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {fileName} — {formatFileSize(fileSize)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Progress
            value={progress}
            className="h-2 mb-1"
            indicatorClassName={cn(
              status === "success" && "bg-green-500",
              status === "error" && "bg-destructive"
            )}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {status === "uploading" && "Uploading..."}
              {status === "processing" && "Processing..."}
              {status === "success" && "Complete!"}
              {status === "error" && (errorMessage || "Failed")}
            </p>
            <p className="text-xs font-medium">{progress}%</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
