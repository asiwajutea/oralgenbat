import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditPagination } from "@/components/AuditPagination";
import { OfflineTablePlaceholder } from "@/components/OfflineTablePlaceholder";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Lock, Unlock, RefreshCw, Loader2, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import Layout from "@/components/Layout";

const LOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour

// Format seconds to MM:SS
const formatTime = (seconds: number): string => {
  if (seconds <= 0) return "EXPIRED";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

interface LockedInterview {
  id: string;
  file_name: string;
  locked_by: string;
  locked_at: string;
  status: string;
  reviewer_name: string | null;
}

const LockedInterviews = () => {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const [filter, setFilter] = useState<"all" | "active" | "expired">("active");
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [confirmUnlock, setConfirmUnlock] = useState<LockedInterview | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePersistentPageSize("locked-interviews", 25);
  
  // Tick state to force re-render every second for countdown
  const [, setTick] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch locked interviews with reviewer names
  const { data: lockedInterviews, isLoading, refetch } = useQuery({
    queryKey: ["locked-interviews"],
    queryFn: async () => {
      const oneHourAgo = new Date(Date.now() - LOCK_DURATION_MS).toISOString();
      
      // Get all interviews that have a lock
      const { data: audits, error: auditsError } = await supabase
        .from("audits")
        .select("id, file_name, locked_by, locked_at, status")
        .not("locked_by", "is", null)
        .not("locked_at", "is", null);

      if (auditsError) throw auditsError;

      if (!audits || audits.length === 0) return [];

      // Get unique user IDs
      const userIds = [...new Set(audits.map(a => a.locked_by))];

      // Fetch profiles for those users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

      return audits.map(audit => ({
        ...audit,
        reviewer_name: profileMap.get(audit.locked_by) || "Unknown",
      })) as LockedInterview[];
    },
  });

  const handleForceUnlock = async (interview: LockedInterview) => {
    setUnlockingId(interview.id);
    try {
      const { error } = await supabase
        .from("audits")
        .update({
          locked_by: null,
          locked_at: null,
        })
        .eq("id", interview.id);

      if (error) throw error;

      toast.success(`Unlocked interview: ${interview.file_name}`);
      queryClient.invalidateQueries({ queryKey: ["locked-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["status-counts"] });
    } catch (error) {
      console.error("Error unlocking interview:", error);
      toast.error("Failed to unlock interview");
    } finally {
      setUnlockingId(null);
      setConfirmUnlock(null);
    }
  };

  const calculateRemainingSeconds = (lockedAt: string): number => {
    const lockedAtDate = new Date(lockedAt);
    const expiresAt = new Date(lockedAtDate.getTime() + LOCK_DURATION_MS);
    return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  };

  const isExpired = (lockedAt: string): boolean => {
    return calculateRemainingSeconds(lockedAt) <= 0;
  };

  // Filter interviews based on selection
  const filteredInterviews = lockedInterviews?.filter(interview => {
    if (filter === "all") return true;
    if (filter === "active") return !isExpired(interview.locked_at);
    if (filter === "expired") return isExpired(interview.locked_at);
    return true;
  }) || [];

  const activeCount = lockedInterviews?.filter(i => !isExpired(i.locked_at)).length || 0;
  const expiredCount = lockedInterviews?.filter(i => isExpired(i.locked_at)).length || 0;
  
  // Paginate filtered interviews
  const totalCount = filteredInterviews.length;
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const paginatedInterviews = filteredInterviews.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  return (
    <Layout>
      <div className="container mx-auto py-6 px-4 max-w-6xl">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Locked Interviews
                </CardTitle>
                <CardDescription>
                  View and manage currently locked interviews
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({lockedInterviews?.length || 0})</SelectItem>
                    <SelectItem value="active">Active ({activeCount})</SelectItem>
                    <SelectItem value="expired">Expired ({expiredCount})</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isLoading}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!isOnline ? (
              <OfflineTablePlaceholder />
            ) : isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : paginatedInterviews.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Lock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No locked interviews found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">SN</TableHead>
                    <TableHead>Interview</TableHead>
                    <TableHead>Locked By</TableHead>
                    <TableHead>Locked At</TableHead>
                    <TableHead>Time Remaining</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedInterviews.map((interview, index) => {
                    const remaining = calculateRemainingSeconds(interview.locked_at);
                    const expired = remaining <= 0;

                    return (
                      <TableRow key={interview.id}>
                        <TableCell className="font-medium">
                          {(currentPage - 1) * itemsPerPage + index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {interview.file_name}
                        </TableCell>
                        <TableCell>{interview.reviewer_name}</TableCell>
                        <TableCell>
                          {format(new Date(interview.locked_at), "MMM d, yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          {expired ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              EXPIRED
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 font-mono">
                              <Clock className="h-3 w-3" />
                              {formatTime(remaining)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{interview.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmUnlock(interview)}
                            disabled={unlockingId === interview.id}
                            className="gap-1.5"
                          >
                            {unlockingId === interview.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Unlock className="h-3.5 w-3.5" />
                            )}
                            Unlock
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
          
          {/* Pagination */}
          <div className="px-6 pb-4">
            <AuditPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          </div>
        </Card>

        {/* Confirmation Dialog */}
        <AlertDialog open={!!confirmUnlock} onOpenChange={() => setConfirmUnlock(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Force Unlock Interview?</AlertDialogTitle>
              <AlertDialogDescription>
                This will unlock <strong>{confirmUnlock?.file_name}</strong> which is currently locked by <strong>{confirmUnlock?.reviewer_name}</strong>.
                <br /><br />
                The reviewer may lose their progress. Are you sure you want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => confirmUnlock && handleForceUnlock(confirmUnlock)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Force Unlock
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
};

export default LockedInterviews;
