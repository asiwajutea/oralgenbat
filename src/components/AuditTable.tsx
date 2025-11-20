import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";

interface Audit {
  id: string;
  file_name: string;
  file_url: string;
  status: "Pending" | "Audit Passed" | "Audit Failed";
  uploaded_at: string;
  last_modified: string;
}

interface AuditTableProps {
  audits: Audit[];
}

const getStatusBadge = (status: Audit["status"]) => {
  switch (status) {
    case "Audit Failed":
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          VAC Audit Failed
        </Badge>
      );
    case "Audit Passed":
      return (
        <Badge className="flex items-center gap-1 bg-success text-success-foreground hover:bg-success/90">
          <CheckCircle2 className="h-3 w-3" />
          VAC Audit Passed
        </Badge>
      );
    case "Pending":
      return (
        <Badge className="flex items-center gap-1 bg-warning text-warning-foreground hover:bg-warning/90">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
  }
};

export const AuditTable = ({ audits }: AuditTableProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Interview ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Modified</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {audits.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No audits found. Upload PDFs to get started.
              </TableCell>
            </TableRow>
          ) : (
            audits.map((audit) => {
              const isExpanded = expandedRows.has(audit.id);
              return (
                <>
                  <TableRow key={audit.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleRow(audit.id)}
                        className="h-6 w-6 p-0"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {audit.file_name}
                    </TableCell>
                    <TableCell>{getStatusBadge(audit.status)}</TableCell>
                    <TableCell>
                      {format(new Date(audit.last_modified), "dd MMM yyyy")}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={4} className="bg-muted/20 p-6">
                        <div className="space-y-2">
                          <div>
                            <span className="font-medium">File Name:</span>{" "}
                            <span className="font-mono text-sm">{audit.file_name}</span>
                          </div>
                          <div>
                            <span className="font-medium">Uploaded:</span>{" "}
                            {format(new Date(audit.uploaded_at), "PPpp")}
                          </div>
                          <div>
                            <span className="font-medium">File URL:</span>{" "}
                            <a
                              href={audit.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-sm"
                            >
                              View PDF
                            </a>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};
