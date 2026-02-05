import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { 
  MessageSquare, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Users,
  RefreshCw,
  Search,
  Eye
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SmsLog {
  id: string;
  audit_id: string | null;
  file_name: string | null;
  interviewer_code: string | null;
  contractor_id: string | null;
  recipients: string[];
  recipients_count: number;
  message: string;
  status: string;
  provider_response: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export default function SmsLogs() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<SmsLog | null>(null);

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["sms-logs", statusFilter, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("sms_notification_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (searchQuery) {
        query = query.or(`file_name.ilike.%${searchQuery}%,interviewer_code.ilike.%${searchQuery}%,contractor_id.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SmsLog[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["sms-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_notification_logs")
        .select("status");
      
      if (error) throw error;
      
      const total = data.length;
      const sent = data.filter(l => l.status === "sent").length;
      const failed = data.filter(l => l.status === "failed" || l.status === "error").length;
      const noRecipients = data.filter(l => l.status === "no_recipients").length;
      
      return { total, sent, failed, noRecipients };
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-emerald-500/90 hover:bg-emerald-600/90 text-white"><CheckCircle className="w-3 h-3 mr-1" /> Sent</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      case "error":
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Error</Badge>;
      case "no_recipients":
        return <Badge variant="secondary"><Users className="w-3 h-3 mr-1" /> No Recipients</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SMS Notification Logs</h1>
          <p className="text-muted-foreground">Track all SMS notifications sent for failed audits</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total SMS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <span className="text-2xl font-bold">{stats?.total || 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sent Successfully</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <span className="text-2xl font-bold">{stats?.sent || 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="text-2xl font-bold">{stats?.failed || 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">No Recipients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats?.noRecipients || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by file name, interviewer code, or contractor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="no_recipients">No Recipients</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
              <p>No SMS logs found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead>Interviewer</TableHead>
                  <TableHead>Contractor</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(log.created_at), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {log.file_name || "-"}
                    </TableCell>
                    <TableCell>{log.interviewer_code || "-"}</TableCell>
                    <TableCell>{log.contractor_id || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.recipients_count}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedLog(log)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>SMS Log Details</DialogTitle>
                            </DialogHeader>
                            {selectedLog && (
                              <div className="space-y-4">
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                                  <div className="mt-1">{getStatusBadge(selectedLog.status)}</div>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Time</label>
                                  <p>{format(new Date(selectedLog.created_at), "PPpp")}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">File Name</label>
                                  <p>{selectedLog.file_name || "-"}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Message</label>
                                  <p className="text-sm bg-muted p-3 rounded-md mt-1">{selectedLog.message || "-"}</p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">Recipients ({selectedLog.recipients_count})</label>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {selectedLog.recipients.length > 0 ? (
                                      selectedLog.recipients.map((phone, i) => (
                                        <Badge key={i} variant="secondary">{phone}</Badge>
                                      ))
                                    ) : (
                                      <span className="text-muted-foreground">No recipients</span>
                                    )}
                                  </div>
                                </div>
                                {selectedLog.error_message && (
                                  <div>
                                    <label className="text-sm font-medium text-destructive">Error</label>
                                    <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md mt-1">
                                      {selectedLog.error_message}
                                    </p>
                                  </div>
                                )}
                                {selectedLog.provider_response && (
                                  <div>
                                    <label className="text-sm font-medium text-muted-foreground">Provider Response</label>
                                    <pre className="text-xs bg-muted p-3 rounded-md mt-1 overflow-auto max-h-32">
                                      {JSON.stringify(selectedLog.provider_response, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {selectedLog.audit_id && (
                                  <Button 
                                    variant="outline" 
                                    className="w-full"
                                    onClick={() => navigate(`/review/${selectedLog.audit_id}`)}
                                  >
                                    View Interview
                                  </Button>
                                )}
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
