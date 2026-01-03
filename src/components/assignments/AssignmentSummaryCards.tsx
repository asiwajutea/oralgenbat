import { Card, CardContent } from "@/components/ui/card";
import { Users, FileText, ClipboardList, CheckCircle2 } from "lucide-react";

interface AssignmentSummaryCardsProps {
  unassignedCount: number;
  unassignedNames: number;
  teamCount: number;
  assignedCount: number;
  assignedNames: number;
}

export const AssignmentSummaryCards = ({
  unassignedCount,
  unassignedNames,
  teamCount,
  assignedCount,
  assignedNames,
}: AssignmentSummaryCardsProps) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Unassigned</p>
              <p className="text-2xl font-bold">{unassignedCount}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {unassignedNames.toLocaleString()} names
                </span>
              </div>
            </div>
            <FileText className="h-6 w-6 text-orange-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Names</p>
              <p className="text-2xl font-bold">{(unassignedNames + assignedNames).toLocaleString()}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  {(unassignedCount + assignedCount).toLocaleString()} interviews
                </span>
              </div>
            </div>
            <Users className="h-6 w-6 text-primary" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Teams</p>
              <p className="text-2xl font-bold">{teamCount}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs text-muted-foreground">Active teams</span>
              </div>
            </div>
            <ClipboardList className="h-6 w-6 text-blue-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Assigned</p>
              <p className="text-2xl font-bold text-green-600">{assignedCount}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {assignedNames.toLocaleString()} names
                </span>
              </div>
            </div>
            <CheckCircle2 className="h-6 w-6 text-green-500" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};