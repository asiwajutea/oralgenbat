import { Card, CardContent } from "@/components/ui/card";
import { Users, FileText, ClipboardList, CheckCircle2 } from "lucide-react";

interface TeamStat {
  teamName: string;
  assigned: number;
  completed: number;
}

interface AssignmentSummaryCardsProps {
  unassignedCount: number;
  unassignedNames: number;
  teamCount: number;
  assignedCount: number;
  assignedNames: number;
  teamStats?: TeamStat[];
}

export const AssignmentSummaryCards = ({
  unassignedCount,
  unassignedNames,
  teamCount,
  assignedCount,
  assignedNames,
  teamStats,
}: AssignmentSummaryCardsProps) => {
  return (
    <div className="space-y-4">
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

      {/* Per-team stats */}
      {teamStats && teamStats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {teamStats.map((ts) => (
            <Card key={ts.teamName}>
              <CardContent className="pt-3 pb-3 px-3">
                <p className="text-xs font-medium text-muted-foreground truncate" title={ts.teamName}>{ts.teamName}</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-lg font-bold text-green-600">{ts.completed}</span>
                  <span className="text-xs text-muted-foreground">/ {ts.assigned}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">completed</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
