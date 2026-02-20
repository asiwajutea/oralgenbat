import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Trash2, Copy, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface DuplicateGroup {
  file_name: string;
  audits: {
    id: string;
    status: string;
    uploaded_at: string;
    reviewed_at: string | null;
    reviewed_by: string | null;
    mobile_zip_url: string | null;
    is_re_audit: boolean;
    re_audit_count: number;
    hasMetadata: boolean;
  }[];
}

const DuplicateInterviews = () => {
  const queryClient = useQueryClient();
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());

  const { data: duplicates, isLoading } = useQuery({
    queryKey: ['duplicate-interviews'],
    queryFn: async () => {
      // Fetch all audits
      const { data: audits, error } = await supabase
        .from('audits')
        .select('id, file_name, status, uploaded_at, reviewed_at, reviewed_by, mobile_zip_url, is_re_audit, re_audit_count')
        .order('uploaded_at', { ascending: true });

      if (error) throw error;

      // Fetch metadata audit_ids
      const { data: metadataRows } = await supabase
        .from('interview_metadata')
        .select('audit_id');

      const metadataAuditIds = new Set((metadataRows || []).map(m => m.audit_id));

      // Group by file_name
      const groups = new Map<string, DuplicateGroup['audits']>();
      (audits || []).forEach(a => {
        const existing = groups.get(a.file_name) || [];
        existing.push({
          ...a,
          is_re_audit: a.is_re_audit || false,
          re_audit_count: a.re_audit_count || 0,
          hasMetadata: metadataAuditIds.has(a.id),
        });
        groups.set(a.file_name, existing);
      });

      // Filter to only duplicates
      const result: DuplicateGroup[] = [];
      groups.forEach((audits, file_name) => {
        if (audits.length > 1) {
          result.push({ file_name, audits });
        }
      });

      return result.sort((a, b) => b.audits.length - a.audits.length);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (auditIds: string[]) => {
      for (const id of auditIds) {
        // Delete related data
        await supabase.from('interview_metadata').delete().eq('audit_id', id);
        await supabase.from('interview_photos').delete().eq('audit_id', id);
        await supabase.from('re_audit_submissions').delete().eq('audit_id', id);
        // Delete audit
        const { error } = await supabase.from('audits').delete().eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Selected duplicates deleted successfully');
      setSelectedForDeletion(new Set());
      queryClient.invalidateQueries({ queryKey: ['duplicate-interviews'] });
    },
    onError: (err: any) => {
      toast.error(`Failed to delete: ${err.message}`);
    },
  });

  const toggleSelection = (auditId: string) => {
    setSelectedForDeletion(prev => {
      const next = new Set(prev);
      if (next.has(auditId)) next.delete(auditId);
      else next.add(auditId);
      return next;
    });
  };

  const totalDuplicateCount = duplicates?.reduce((sum, g) => sum + g.audits.length - 1, 0) || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Duplicate Interview Detection</h1>
          <p className="text-muted-foreground">
            {duplicates?.length || 0} duplicate groups found ({totalDuplicateCount} extra copies)
          </p>
        </div>
        {selectedForDeletion.size > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete {selectedForDeletion.size} Selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Duplicate Interviews?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete {selectedForDeletion.size} audit records along with their metadata, photos, and re-audit submissions. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate(Array.from(selectedForDeletion))}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {(!duplicates || duplicates.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold">No Duplicates Found</h3>
            <p className="text-muted-foreground">All interview folder names are unique.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {duplicates.map(group => (
            <Card key={group.file_name}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Copy className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{group.file_name.replace('.pdf', '')}</span>
                  <Badge variant="secondary" className="ml-auto">{group.audits.length} copies</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">Del</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead>Reviewed</TableHead>
                        <TableHead>Reviewed By</TableHead>
                        <TableHead>Metadata</TableHead>
                        <TableHead>ZIP</TableHead>
                        <TableHead>Re-Audit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.audits.map(audit => (
                        <TableRow key={audit.id} className={selectedForDeletion.has(audit.id) ? 'bg-destructive/10' : ''}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedForDeletion.has(audit.id)}
                              onChange={() => toggleSelection(audit.id)}
                              className="h-4 w-4"
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              audit.status === 'Audit Passed' ? 'default' :
                              audit.status === 'Audit Failed' ? 'destructive' : 'secondary'
                            } className="text-xs">
                              {audit.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{format(new Date(audit.uploaded_at), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="text-sm">{audit.reviewed_at ? format(new Date(audit.reviewed_at), 'MMM d, yyyy') : '-'}</TableCell>
                          <TableCell className="text-sm">{audit.reviewed_by || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={audit.hasMetadata ? 'default' : 'outline'} className="text-xs">
                              {audit.hasMetadata ? 'Yes' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={audit.mobile_zip_url ? 'default' : 'outline'} className="text-xs">
                              {audit.mobile_zip_url ? 'Yes' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {audit.is_re_audit ? `#${audit.re_audit_count}` : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default DuplicateInterviews;
