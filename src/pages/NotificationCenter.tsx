import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, MessageSquare, Send, Pencil, Loader2 } from "lucide-react";
import SmsLogs from "@/pages/SmsLogs";

interface EmailTemplate {
  id: string; key: string; name: string; description: string | null;
  subject: string; body_html: string; body_text: string | null;
  enabled: boolean; available_vars: string[]; notification_type: string | null;
}
interface EmailLog {
  id: string; template_key: string | null; recipients: string[]; subject: string | null;
  status: string; error_message: string | null; created_at: string; triggered_by_event: string | null;
}

function TemplatesTab() {
  const qc = useQueryClient();
  const { data: templates, isLoading } = useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_templates").select("*").order("name");
      if (error) throw error;
      return data as EmailTemplate[];
    },
  });
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.from("email_templates").update({
      subject: editing.subject, body_html: editing.body_html,
      body_text: editing.body_text, enabled: editing.enabled,
    }).eq("id", editing.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Template saved");
    qc.invalidateQueries({ queryKey: ["email-templates"] });
    setEditing(null);
  };

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;

  return (
    <div className="space-y-3">
      {templates?.map((t) => (
        <Card key={t.id}>
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{t.name}</span>
                <Badge variant="outline" className="text-xs">{t.key}</Badge>
                {!t.enabled && <Badge variant="destructive" className="text-xs">Disabled</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">{t.subject}</p>
              {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing({ ...t })}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit: {editing?.name}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Enabled</Label>
                <Switch checked={editing.enabled} onCheckedChange={(v) => setEditing({ ...editing, enabled: v })} />
              </div>
              <div>
                <Label>Available variables</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(editing.available_vars || []).map((v) => (
                    <Badge key={v} variant="secondary" className="text-xs font-mono">{`{{${v}}}`}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label>Subject</Label>
                <Input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
              </div>
              <div>
                <Label>HTML body</Label>
                <Textarea rows={10} className="font-mono text-xs" value={editing.body_html} onChange={(e) => setEditing({ ...editing, body_html: e.target.value })} />
              </div>
              <div>
                <Label>Plain-text body</Label>
                <Textarea rows={5} className="font-mono text-xs" value={editing.body_text || ""} onChange={(e) => setEditing({ ...editing, body_text: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmailLogsTab() {
  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["email-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_notification_logs")
        .select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as EmailLog[];
    },
  });
  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin" />;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Email Logs (last 200)</CardTitle>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Refresh</Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs?.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs"><Badge variant="outline">{l.template_key}</Badge></TableCell>
                <TableCell className="text-xs">{l.recipients?.join(", ")}</TableCell>
                <TableCell className="text-xs max-w-[260px] truncate">{l.subject}</TableCell>
                <TableCell>
                  <Badge variant={l.status === "sent" ? "default" : l.status === "failed" ? "destructive" : "secondary"}>{l.status}</Badge>
                </TableCell>
                <TableCell className="text-xs text-destructive max-w-[260px] truncate">{l.error_message}</TableCell>
              </TableRow>
            ))}
            {!logs?.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No logs yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TestEmailTab() {
  const [to, setTo] = useState("");
  const [templateKey, setTemplateKey] = useState("test_email");
  const [sending, setSending] = useState(false);
  const { data: templates } = useQuery({
    queryKey: ["email-templates-keys"],
    queryFn: async () => {
      const { data } = await supabase.from("email_templates").select("key,name").order("name");
      return data || [];
    },
  });
  const send = async () => {
    if (!to) return toast.error("Enter a recipient email");
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-test-email", { body: { to, template_key: templateKey } });
    setSending(false);
    if (error || (data as any)?.success === false) {
      toast.error(`Failed: ${error?.message || (data as any)?.error || "unknown"}`);
    } else {
      toast.success(`Test email sent to ${to}`);
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Send a test email</CardTitle></CardHeader>
      <CardContent className="space-y-3 max-w-lg">
        <div>
          <Label>Recipient email</Label>
          <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <Label>Template</Label>
          <Select value={templateKey} onValueChange={setTemplateKey}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {templates?.map((t: any) => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={send} disabled={sending}>{sending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Send Test</Button>
        <p className="text-xs text-muted-foreground">Sent from "BAT Audit" &lt;Zamoph.audit@gmail.com&gt;.</p>
      </CardContent>
    </Card>
  );
}

export default function NotificationCenter() {
  return (
    <div className="container mx-auto p-3 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="h-6 w-6" /> Notification Center</h1>
        <p className="text-sm text-muted-foreground">Manage SMS &amp; Email notifications, templates, and test sends.</p>
      </div>
      <Tabs defaultValue="sms" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-auto">
          <TabsTrigger value="sms"><MessageSquare className="h-4 w-4 md:mr-1" /><span className="hidden md:inline">SMS Logs</span></TabsTrigger>
          <TabsTrigger value="email"><Mail className="h-4 w-4 md:mr-1" /><span className="hidden md:inline">Email Logs</span></TabsTrigger>
          <TabsTrigger value="templates"><Pencil className="h-4 w-4 md:mr-1" /><span className="hidden md:inline">Templates</span></TabsTrigger>
          <TabsTrigger value="test"><Send className="h-4 w-4 md:mr-1" /><span className="hidden md:inline">Test</span></TabsTrigger>
        </TabsList>
        <TabsContent value="sms"><SmsLogs /></TabsContent>
        <TabsContent value="email"><EmailLogsTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="test"><TestEmailTab /></TabsContent>
      </Tabs>
    </div>
  );
}