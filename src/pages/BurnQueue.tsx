import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditPagination } from "@/components/AuditPagination";
import { Flame, RotateCcw, Search, Loader2 } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { toast } from "@/hooks/use-toast";

const BURN_DAYS = 190;

const BurnQueue = () => {
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const { data, isLoading } = useQuery({
    queryKey: ["burn-queue", currentPage, itemsPerPage, searchTerm, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("burn_queue")
        .select("*", { count: "exact" })
        .order("sent_at", { ascending: false });

      if (statusFilter === "active") {
        query = query.is("restored_at", null);
      } else if (statusFilter === "restored") {
        query = query.not("restored_at", "is", null);
      }

      if (searchTerm) {
        query = query.ilike("file_name", `%${searchTerm}%`);
      }

      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      const { data: items, count, error } = await query.range(from, to);

      if (error) throw error;
      return { items: items || [], totalCount: count || 0 };
    },
  });

  // Resolve sender names
  const senderIds = [...new Set(data?.items.map((i) => i.sent_by) || [])];
  const { data: senderProfiles = [] } = useQuery({
    queryKey: ["burn-queue-senders", senderIds],
    queryFn: async () => {
      if (senderIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", senderIds);
      return data || [];
    },
    enabled: senderIds.length > 0,
  });

  const senderMap = new Map(senderProfiles.map((p) => [p.id, p.full_name]));

  const restoreMutation = useMutation({
    mutationFn: async (burnId: string) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("burn_queue")
        .update({ restored_at: new Date().toISOString(), restored_by: user.id })
        .eq("id", burnId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Interview restored", description: "The interview has been restored from the burn queue." });
      queryClient.invalidateQueries({ queryKey: ["burn-queue"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
      queryClient.invalidateQueries({ queryKey: ["admin-review-history"] });
      queryClient.invalidateQueries({ queryKey: ["contractor-audits"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to restore", description: error.message, variant: "destructive" });
    },
  });

  const totalPages = Math.ceil((data?.totalCount || 0) / itemsPerPage);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container py-4 sm:py-8 px-4 sm:px-6 space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3">
          <Flame className="h-8 w-8 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">Burn Queue</h1>
            <p className="text-sm text-muted-foreground">
              Interviews scheduled for permanent deletion after {BURN_DAYS} days
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by file name..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="restored">Restored</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {data?.items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No items in the burn queue
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">SN</TableHead>
                      <TableHead>File Name</TableHead>
                      <TableHead>Sent By</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Days Remaining</TableHead>
                      <TableHead>Status</TableHead>
                      {isAdmin && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.items.map((item, index) => {
                      const daysSinceSent = differenceInDays(new Date(), new Date(item.sent_at));
                      const daysRemaining = Math.max(0, BURN_DAYS - daysSinceSent);
                      const isRestored = !!item.restored_at;

                      return (
                        <TableRow key={item.id}>
                          <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                          <TableCell className="font-mono text-sm font-medium">
                            {item.file_name}
                          </TableCell>
                          <TableCell className="text-sm">
                            {senderMap.get(item.sent_by) || "Unknown"}
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate" title={item.reason}>
                            {item.reason}
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(item.sent_at), "PPp")}
                          </TableCell>
                          <TableCell>
                            {isRestored ? (
                              <span className="text-sm text-muted-foreground">-</span>
                            ) : (
                              <Badge variant={daysRemaining <= 30 ? "destructive" : "secondary"}>
                                {daysRemaining} days
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {isRestored ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">
                                Restored
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                Ready to Burn
                              </Badge>
                            )}
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              {!isRestored && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => restoreMutation.mutate(item.id)}
                                  disabled={restoreMutation.isPending}
                                  className="gap-1"
                                >
                                  {restoreMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3 w-3" />
                                  )}
                                  Restore
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <AuditPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={data?.totalCount || 0}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(v) => { setItemsPerPage(v); setCurrentPage(1); }}
        />
      </div>
    </div>
  );
};

export default BurnQueue;
