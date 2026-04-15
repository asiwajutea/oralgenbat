import { useState, useEffect, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Bug, CheckCircle2, AlertTriangle, Globe, Search, RefreshCw, Sparkles, XCircle, ChevronDown, ChevronUp, StickyNote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, subDays, subHours, isAfter } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import ReactMarkdown from "react-markdown";

interface ErrorLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  error_message: string;
  error_stack: string | null;
  error_source: string | null;
  page_url: string | null;
  component_name: string | null;
  browser_info: string | null;
  created_at: string;
  resolved: boolean | null;
  resolved_at: string | null;
  resolved_by: string | null;
  notes: string | null;
  suggested_fix: string | null;
}

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

const ErrorConsole = () => {
  const { user, userRole, loading } = useAuth();
  const queryClient = useQueryClient();

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("unresolved");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [noteDialog, setNoteDialog] = useState<{ open: boolean; errorId: string; currentNote: string }>({ open: false, errorId: "", currentNote: "" });
  const [noteText, setNoteText] = useState("");

  // Fetch all error logs
  const { data: errors = [], isLoading, refetch } = useQuery({
    queryKey: ["client-error-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_error_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as ErrorLog[];
    },
    refetchInterval: 30000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("error-logs-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "client_error_logs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["client-error-logs"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Mutations
  const resolveError = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_error_logs")
        .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: user?.id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-error-logs"] });
      toast.success("Error marked as resolved");
    },
  });

  const unresolveError = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_error_logs")
        .update({ resolved: false, resolved_at: null, resolved_by: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-error-logs"] });
      toast.success("Error reopened");
    },
  });

  const bulkResolve = useMutation({
    mutationFn: async () => {
      const unresolvedIds = filteredErrors.filter(e => !e.resolved).map(e => e.id);
      if (unresolvedIds.length === 0) return;
      const { error } = await supabase
        .from("client_error_logs")
        .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: user?.id })
        .in("id", unresolvedIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-error-logs"] });
      toast.success("All visible errors marked as resolved");
    },
  });

  const saveNote = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from("client_error_logs")
        .update({ notes })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-error-logs"] });
      setNoteDialog({ open: false, errorId: "", currentNote: "" });
      toast.success("Note saved");
    },
  });

  const getSuggestion = useMutation({
    mutationFn: async (errorLog: ErrorLog) => {
      const { data, error } = await supabase.functions.invoke("suggest-error-fix", {
        body: {
          error_message: errorLog.error_message,
          error_stack: errorLog.error_stack,
          error_source: errorLog.error_source,
          page_url: errorLog.page_url,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Save suggestion to DB
      await supabase
        .from("client_error_logs")
        .update({ suggested_fix: data.suggestion })
        .eq("id", errorLog.id);
      return data.suggestion;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-error-logs"] });
      toast.success("AI suggestion generated");
    },
    onError: (err: Error) => {
      toast.error(`Failed to get suggestion: ${err.message}`);
    },
  });

  // Filtered errors
  const filteredErrors = useMemo(() => {
    return errors.filter((e) => {
      if (statusFilter === "resolved" && !e.resolved) return false;
      if (statusFilter === "unresolved" && e.resolved) return false;
      if (sourceFilter !== "all" && e.error_source !== sourceFilter) return false;
      if (searchQuery && !e.error_message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [errors, statusFilter, sourceFilter, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const last24h = subHours(new Date(), 24);
    const errors24h = errors.filter(e => isAfter(new Date(e.created_at), last24h));
    const unresolved = errors.filter(e => !e.resolved);

    // Most affected page
    const pageCounts: Record<string, number> = {};
    unresolved.forEach(e => {
      if (e.page_url) {
        const path = new URL(e.page_url).pathname;
        pageCounts[path] = (pageCounts[path] || 0) + 1;
      }
    });
    const topPage = Object.entries(pageCounts).sort((a, b) => b[1] - a[1])[0];

    // Most common error
    const msgCounts: Record<string, number> = {};
    unresolved.forEach(e => {
      const short = e.error_message.slice(0, 80);
      msgCounts[short] = (msgCounts[short] || 0) + 1;
    });
    const topMsg = Object.entries(msgCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      total24h: errors24h.length,
      unresolved: unresolved.length,
      topPage: topPage ? `${topPage[0]} (${topPage[1]})` : "None",
      topError: topMsg ? `${topMsg[0]}... (${topMsg[1]}x)` : "None",
    };
  }, [errors]);

  // Chart data: errors by day (last 7 days)
  const dailyChartData = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = subDays(new Date(), i);
      const dayStr = format(day, "yyyy-MM-dd");
      const count = errors.filter(e => format(new Date(e.created_at), "yyyy-MM-dd") === dayStr).length;
      days.push({ date: format(day, "MMM dd"), count });
    }
    return days;
  }, [errors]);

  // Chart data: errors by source
  const sourceChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    errors.forEach(e => {
      const src = e.error_source || "unknown";
      counts[src] = (counts[src] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [errors]);

  // Top 5 most frequent errors
  const topErrors = useMemo(() => {
    const counts: Record<string, { message: string; count: number; source: string }> = {};
    errors.forEach(e => {
      const key = e.error_message.slice(0, 100);
      if (!counts[key]) counts[key] = { message: key, count: 0, source: e.error_source || "unknown" };
      counts[key].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [errors]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user || userRole !== "super_admin") {
    return <Navigate to="/" replace />;
  }

  const getSourceBadge = (source: string | null) => {
    const variants: Record<string, string> = {
      runtime: "bg-destructive/10 text-destructive",
      unhandled_rejection: "bg-orange-500/10 text-orange-600",
      react_boundary: "bg-red-600/10 text-red-600",
      network: "bg-yellow-500/10 text-yellow-600",
    };
    return <Badge variant="outline" className={variants[source || ""] || ""}>{source || "unknown"}</Badge>;
  };

  return (
    <div className="container py-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="h-6 w-6 text-destructive" />
            Error Debug Console
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time error monitoring with AI-powered fix suggestions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => bulkResolve.mutate()}
            disabled={bulkResolve.isPending || filteredErrors.filter(e => !e.resolved).length === 0}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Resolve All Visible
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Errors (24h)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.total24h}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Unresolved</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{stats.unresolved}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Most Affected Page</CardTitle></CardHeader>
          <CardContent><div className="text-sm font-medium truncate">{stats.topPage}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Most Common Error</CardTitle></CardHeader>
          <CardContent><div className="text-sm font-medium truncate">{stats.topError}</div></CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Errors Over Time (7 Days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} className="text-xs" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }} />
                <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">By Source</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={sourceChartData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" nameKey="name" paddingAngle={2}>
                  {sourceChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top 5 Frequent Errors */}
      {topErrors.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Top 5 Most Frequent Errors</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topErrors.map((e, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate">{e.message}</p>
                    <span className="text-xs text-muted-foreground">{e.source}</span>
                  </div>
                  <Badge variant="destructive" className="ml-2 shrink-0">{e.count}x</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search error messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="runtime">Runtime</SelectItem>
            <SelectItem value="unhandled_rejection">Unhandled Rejection</SelectItem>
            <SelectItem value="react_boundary">React Boundary</SelectItem>
            <SelectItem value="network">Network</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unresolved">Unresolved</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filteredErrors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-primary" />
              <p className="font-medium">No errors found</p>
              <p className="text-sm">The system is running smoothly.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Time</TableHead>
                  <TableHead className="w-[140px]">User</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-[120px]">Source</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredErrors.map((err) => (
                  <>
                    <TableRow
                      key={err.id}
                      className="cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === err.id ? null : err.id)}
                    >
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(err.created_at), "MMM dd, HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs truncate max-w-[120px]">{err.user_email || "Anonymous"}</div>
                        <div className="text-xs text-muted-foreground capitalize">{err.user_role || ""}</div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-mono truncate max-w-[300px]">{err.error_message}</p>
                        {err.page_url && (
                          <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                            <Globe className="inline h-3 w-3 mr-1" />
                            {new URL(err.page_url).pathname}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{getSourceBadge(err.error_source)}</TableCell>
                      <TableCell>
                        {err.resolved ? (
                          <Badge variant="outline" className="bg-primary/10 text-primary">Resolved</Badge>
                        ) : (
                          <Badge variant="destructive">Open</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {expandedRow === err.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </TableCell>
                    </TableRow>

                    {/* Expanded Detail */}
                    {expandedRow === err.id && (
                      <TableRow key={`${err.id}-detail`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-4">
                          <div className="space-y-4">
                            {/* Stack trace */}
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Stack Trace</h4>
                              <pre className="text-xs bg-background p-3 rounded-md overflow-auto max-h-48 border font-mono whitespace-pre-wrap">
                                {err.error_stack || "No stack trace available"}
                              </pre>
                            </div>

                            {/* Meta info */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                              <div>
                                <span className="text-muted-foreground">Browser:</span>
                                <p className="truncate">{err.browser_info || "Unknown"}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Page:</span>
                                <p className="truncate">{err.page_url || "Unknown"}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Component:</span>
                                <p className="truncate">{err.component_name || "N/A"}</p>
                              </div>
                            </div>

                            {/* Notes */}
                            {err.notes && (
                              <div>
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Notes</h4>
                                <p className="text-sm bg-background p-2 rounded-md border">{err.notes}</p>
                              </div>
                            )}

                            {/* AI Suggestion */}
                            {err.suggested_fix && (
                              <div>
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1 flex items-center gap-1">
                                  <Sparkles className="h-3 w-3" /> AI Suggested Fix
                                </h4>
                                <div className="text-sm bg-background p-3 rounded-md border prose prose-sm dark:prose-invert max-w-none">
                                  <ReactMarkdown>{err.suggested_fix}</ReactMarkdown>
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {err.resolved ? (
                                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); unresolveError.mutate(err.id); }}>
                                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reopen
                                </Button>
                              ) : (
                                <Button size="sm" variant="default" onClick={(e) => { e.stopPropagation(); resolveError.mutate(err.id); }}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolve
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNoteText(err.notes || "");
                                  setNoteDialog({ open: true, errorId: err.id, currentNote: err.notes || "" });
                                }}
                              >
                                <StickyNote className="h-3.5 w-3.5 mr-1" /> Note
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={getSuggestion.isPending}
                                onClick={(e) => { e.stopPropagation(); getSuggestion.mutate(err); }}
                              >
                                {getSuggestion.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                ) : (
                                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                                )}
                                {err.suggested_fix ? "Refresh Fix" : "Get AI Fix"}
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Note Dialog */}
      <Dialog open={noteDialog.open} onOpenChange={(open) => setNoteDialog({ ...noteDialog, open })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note about this error..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog({ open: false, errorId: "", currentNote: "" })}>Cancel</Button>
            <Button onClick={() => saveNote.mutate({ id: noteDialog.errorId, notes: noteText })} disabled={saveNote.isPending}>
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ErrorConsole;
