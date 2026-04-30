import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export interface ActivityRow {
  id: string;
  user_id: string;
  user_role: string | null;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  description: string | null;
  metadata: any;
  created_at: string;
}

const actionVariant = (action: string): "default" | "secondary" | "destructive" | "outline" => {
  if (action.includes("failed") || action.includes("suspended") || action.includes("rejected") || action.includes("burn")) return "destructive";
  if (action.includes("passed") || action.includes("approved") || action.includes("created") || action.includes("uploaded")) return "default";
  if (action.includes("override") || action.includes("re_audit") || action.includes("reassigned")) return "secondary";
  return "outline";
};

const entityHref = (row: ActivityRow): string | null => {
  if (!row.entity_id) return null;
  switch (row.entity_type) {
    case "audit":
    case "fm_override":
      return `/review/${row.entity_id}`;
    case "team_assignment":
      return `/admin/team-assignments`;
    case "payment":
      return `/payment-tracking`;
    case "announcement":
      return `/notices`;
    default:
      return null;
  }
};

const ActivityItem = ({ row }: { row: ActivityRow }) => {
  const [open, setOpen] = useState(false);
  const href = entityHref(row);
  const hasMeta = row.metadata && Object.keys(row.metadata).length > 0;

  return (
    <div className="border-b last:border-b-0 py-3 px-2">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <Badge variant={actionVariant(row.action_type)} className="text-xs whitespace-nowrap">
            {row.action_type.replace(/_/g, " ")}
          </Badge>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-sm">
              {row.description || `${row.action_type} ${row.entity_label ?? ""}`}
            </p>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {format(new Date(row.created_at), "MMM d, yyyy HH:mm")}
            </span>
          </div>
          {row.entity_label && (
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{row.entity_label}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            {href && (
              <Link to={href} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                Open <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            {hasMeta && (
              <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => setOpen(o => !o)}>
                {open ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
                Details
              </Button>
            )}
          </div>
          {open && hasMeta && (
            <pre className="mt-2 text-xs bg-muted/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(row.metadata, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

export const ActivityTimeline = ({ rows, isLoading }: { rows: ActivityRow[]; isLoading?: boolean }) => {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading activity…</CardContent>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No activity matches the current filters.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0 divide-y">
        {rows.map(r => <ActivityItem key={r.id} row={r} />)}
      </CardContent>
    </Card>
  );
};