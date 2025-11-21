import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Package, User, Calendar } from "lucide-react";
import { format } from "date-fns";

interface ReAuditHistoryProps {
  auditId: string;
}

export const ReAuditHistory = ({ auditId }: ReAuditHistoryProps) => {
  const { data: submissions, isLoading } = useQuery({
    queryKey: ["re-audit-history", auditId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("re_audit_submissions")
        .select(`
          *,
          submitter:profiles!submitted_by (
            full_name
          )
        `)
        .eq("audit_id", auditId)
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading history...</div>;
  }

  if (!submissions || submissions.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Re-Audit History ({submissions.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-4">
            {submissions.map((submission, index) => (
              <div
                key={submission.id}
                className="border-l-2 border-primary pl-4 pb-4 relative"
              >
                <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-primary" />
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {(submission.submitter as any)?.full_name || "Unknown User"}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {submission.submitted_by_role}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(submission.submitted_at), "MMM d, yyyy HH:mm")}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {submission.replaced_pdf && (
                      <Badge variant="secondary" className="text-xs">
                        <FileText className="h-3 w-3 mr-1" />
                        PDF Replaced
                      </Badge>
                    )}
                    {submission.replaced_zip && (
                      <Badge variant="secondary" className="text-xs">
                        <Package className="h-3 w-3 mr-1" />
                        ZIP Replaced
                      </Badge>
                    )}
                  </div>

                  {submission.submission_comment && (
                    <div className="text-sm bg-muted p-3 rounded-md">
                      <p className="text-muted-foreground italic">
                        "{submission.submission_comment}"
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
