import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Team, UnassignedInterview, useAssignInterviews } from "@/hooks/useTeamAssignments";

interface AIAutoAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: Team[];
  unassignedInterviews: UnassignedInterview[];
}

// Store balance tracking in localStorage for next batch reference
const BALANCE_TRACKING_KEY = 'assignment_balance_tracking';

interface BalanceRecord {
  teamId: string;
  teamName: string;
  difference: number; // Positive = over-assigned, negative = under-assigned
  timestamp: string;
}

const getStoredBalance = (): BalanceRecord[] => {
  try {
    const stored = localStorage.getItem(BALANCE_TRACKING_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveBalanceTracking = (records: BalanceRecord[]) => {
  localStorage.setItem(BALANCE_TRACKING_KEY, JSON.stringify(records));
};

export const AIAutoAssignDialog = ({
  open,
  onOpenChange,
  teams,
  unassignedInterviews,
}: AIAutoAssignDialogProps) => {
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [distributionMode, setDistributionMode] = useState<"equal" | "custom">("equal");
  const [customPercentages, setCustomPercentages] = useState<Record<string, number>>({});
  const [groupByAgent, setGroupByAgent] = useState(true);
  const [applyBalanceCorrection, setApplyBalanceCorrection] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const assignInterviews = useAssignInterviews();

  const totalNames = unassignedInterviews.reduce((sum, i) => sum + i.total_names, 0);
  const storedBalance = getStoredBalance();

  const toggleTeam = (teamId: string) => {
    const newSelected = new Set(selectedTeams);
    if (newSelected.has(teamId)) {
      newSelected.delete(teamId);
    } else {
      newSelected.add(teamId);
    }
    setSelectedTeams(newSelected);
  };

  const handlePercentageChange = (teamId: string, value: string) => {
    setCustomPercentages((prev) => ({
      ...prev,
      [teamId]: parseInt(value) || 0,
    }));
  };

  const runAIAssignment = async () => {
    if (selectedTeams.size === 0) {
      toast.error("Please select at least one team");
      return;
    }

    setIsProcessing(true);

    try {
      // Get distribution percentages
      const teamArray = Array.from(selectedTeams);
      let distribution: Record<string, number> = {};

      if (distributionMode === "equal") {
        const percentage = 100 / teamArray.length;
        teamArray.forEach((teamId) => {
          distribution[teamId] = percentage;
        });
      } else {
        const total = teamArray.reduce((sum, teamId) => sum + (customPercentages[teamId] || 0), 0);
        if (total !== 100) {
          toast.error("Custom percentages must add up to 100%");
          setIsProcessing(false);
          return;
        }
        distribution = { ...customPercentages };
      }

      // Group interviews by agent if enabled
      let interviewGroups: UnassignedInterview[][];
      if (groupByAgent) {
        const byAgent = new Map<string, UnassignedInterview[]>();
        unassignedInterviews.forEach((interview) => {
          const key = interview.interviewer_code || "unknown";
          const group = byAgent.get(key) || [];
          group.push(interview);
          byAgent.set(key, group);
        });
        interviewGroups = Array.from(byAgent.values());
      } else {
        interviewGroups = unassignedInterviews.map((i) => [i]);
      }

      // Calculate target names per team (with balance correction)
      const teamTargets: Record<string, number> = {};
      const teamCurrentNames: Record<string, number> = {};
      
      teamArray.forEach((teamId) => {
        let baseTarget = (distribution[teamId] / 100) * totalNames;
        
        // Apply balance correction from previous batch
        if (applyBalanceCorrection) {
          const previousBalance = storedBalance.find((b) => b.teamId === teamId);
          if (previousBalance) {
            // If team was under-assigned before (negative difference), give them more now
            baseTarget -= previousBalance.difference;
          }
        }
        
        teamTargets[teamId] = Math.max(0, baseTarget);
        teamCurrentNames[teamId] = 0;
      });

      // Assign groups to teams (greedy approach)
      const assignments: { auditId: string; teamId: string; totalNames: number }[] = [];

      // Sort groups by total names descending (larger groups first)
      interviewGroups.sort((a, b) => {
        const aTotalNames = a.reduce((sum, i) => sum + i.total_names, 0);
        const bTotalNames = b.reduce((sum, i) => sum + i.total_names, 0);
        return bTotalNames - aTotalNames;
      });

      interviewGroups.forEach((group) => {
        const groupNames = group.reduce((sum, i) => sum + i.total_names, 0);

        // Find the team that's furthest below their target
        let bestTeam = teamArray[0];
        let bestDifference = -Infinity;

        teamArray.forEach((teamId) => {
          const remaining = teamTargets[teamId] - teamCurrentNames[teamId];
          if (remaining > bestDifference) {
            bestDifference = remaining;
            bestTeam = teamId;
          }
        });

        // Assign all interviews in this group to the best team
        group.forEach((interview) => {
          assignments.push({
            auditId: interview.id,
            teamId: bestTeam,
            totalNames: interview.total_names,
          });
        });

        teamCurrentNames[bestTeam] += groupNames;
      });

      // Execute assignments
      await assignInterviews.mutateAsync(assignments);

      // Calculate and store balance for next batch
      const newBalanceRecords: BalanceRecord[] = [];
      const imbalanceWarnings: string[] = [];
      
      teamArray.forEach((teamId) => {
        const team = teams.find((t) => t.id === teamId);
        const targetNames = (distribution[teamId] / 100) * totalNames;
        const actualNames = teamCurrentNames[teamId];
        const difference = actualNames - targetNames;
        const differencePercentage = (difference / totalNames) * 100;
        
        newBalanceRecords.push({
          teamId,
          teamName: team?.name || 'Unknown',
          difference,
          timestamp: new Date().toISOString(),
        });
        
        // Warn if imbalance exceeds 5%
        if (Math.abs(differencePercentage) > 5) {
          const direction = difference > 0 ? 'over-assigned' : 'under-assigned';
          imbalanceWarnings.push(
            `${team?.name}: ${direction} by ${Math.abs(Math.round(difference)).toLocaleString()} names (${Math.abs(differencePercentage).toFixed(1)}%)`
          );
        }
      });

      // Save balance tracking for next batch
      saveBalanceTracking(newBalanceRecords);

      // Show success with any imbalance warnings
      toast.success(`Successfully assigned ${assignments.length} interviews to ${selectedTeams.size} teams`);
      
      if (imbalanceWarnings.length > 0) {
        toast.warning(
          'Distribution slightly imbalanced',
          {
            description: (
              <div className="mt-1 space-y-1 text-xs">
                {imbalanceWarnings.map((warning, i) => (
                  <div key={i}>{warning}</div>
                ))}
                <div className="mt-2 text-muted-foreground">
                  This will be corrected in the next batch.
                </div>
              </div>
            ),
            duration: 8000,
          }
        );
      }
      
      onOpenChange(false);
    } catch (error) {
      console.error("AI assignment error:", error);
      toast.error("Failed to assign interviews. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate preview distribution
  const getPreviewDistribution = () => {
    if (selectedTeams.size === 0) return [];

    const teamArray = Array.from(selectedTeams);
    if (distributionMode === "equal") {
      const perTeam = totalNames / teamArray.length;
      return teamArray.map((teamId) => {
        const previousBalance = storedBalance.find((b) => b.teamId === teamId);
        const correction = applyBalanceCorrection && previousBalance ? -previousBalance.difference : 0;
        return {
          teamId,
          team: teams.find((t) => t.id === teamId),
          names: Math.round(perTeam + correction),
          percentage: 100 / teamArray.length,
          correction,
        };
      });
    } else {
      return teamArray.map((teamId) => {
        const previousBalance = storedBalance.find((b) => b.teamId === teamId);
        const correction = applyBalanceCorrection && previousBalance ? -previousBalance.difference : 0;
        return {
          teamId,
          team: teams.find((t) => t.id === teamId),
          names: Math.round((totalNames * (customPercentages[teamId] || 0)) / 100 + correction),
          percentage: customPercentages[teamId] || 0,
          correction,
        };
      });
    }
  };

  const preview = getPreviewDistribution();
  const hasStoredBalance = storedBalance.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Auto-Assign Interviews
          </DialogTitle>
          <DialogDescription>
            Configure how to distribute {unassignedInterviews.length} interviews ({totalNames.toLocaleString()} names) to teams.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Balance Correction Notice */}
          {hasStoredBalance && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-800">Previous batch imbalance detected</p>
                <p className="text-amber-700 text-xs mt-1">
                  Some teams were over/under-assigned in the last batch. Enable correction below to balance this batch.
                </p>
              </div>
            </div>
          )}

          {/* Team Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Teams</Label>
            <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
              {teams.map((team) => (
                <div key={team.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`team-${team.id}`}
                    checked={selectedTeams.has(team.id)}
                    onCheckedChange={() => toggleTeam(team.id)}
                  />
                  <Label htmlFor={`team-${team.id}`} className="text-sm cursor-pointer">
                    {team.name}
                  </Label>
                </div>
              ))}
              {teams.length === 0 && (
                <p className="text-sm text-muted-foreground">No teams created yet</p>
              )}
            </div>
          </div>

          {/* Distribution Mode */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Distribution Method</Label>
            <RadioGroup value={distributionMode} onValueChange={(v) => setDistributionMode(v as "equal" | "custom")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="equal" id="equal" />
                <Label htmlFor="equal" className="text-sm cursor-pointer">
                  Equal distribution (balanced total names)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="custom" />
                <Label htmlFor="custom" className="text-sm cursor-pointer">
                  Custom percentages
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Custom Percentages */}
          {distributionMode === "custom" && selectedTeams.size > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Custom Percentages</Label>
              <div className="grid grid-cols-2 gap-3">
                {Array.from(selectedTeams).map((teamId) => {
                  const team = teams.find((t) => t.id === teamId);
                  return (
                    <div key={teamId} className="flex items-center gap-2">
                      <span className="text-sm flex-1 truncate">{team?.name}:</span>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={customPercentages[teamId] || ""}
                        onChange={(e) => handlePercentageChange(teamId, e.target.value)}
                        className="w-20 h-8"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Additional Options */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="group-by-agent"
                checked={groupByAgent}
                onCheckedChange={(checked) => setGroupByAgent(checked === true)}
              />
              <Label htmlFor="group-by-agent" className="text-sm cursor-pointer">
                Keep same agent's interviews together in one team
              </Label>
            </div>
            
            {hasStoredBalance && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="apply-balance"
                  checked={applyBalanceCorrection}
                  onCheckedChange={(checked) => setApplyBalanceCorrection(checked === true)}
                />
                <Label htmlFor="apply-balance" className="text-sm cursor-pointer">
                  Apply balance correction from previous batch
                </Label>
              </div>
            )}
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <Label className="text-sm font-medium">Preview Distribution</Label>
              {preview.map(({ team, names, percentage, correction }) => (
                <div key={team?.id} className="flex justify-between text-sm">
                  <span>{team?.name}</span>
                  <span className="text-muted-foreground">
                    ~{names.toLocaleString()} names ({percentage.toFixed(1)}%)
                    {correction !== 0 && (
                      <span className={correction > 0 ? "text-green-600" : "text-red-600"}>
                        {" "}({correction > 0 ? "+" : ""}{Math.round(correction).toLocaleString()} correction)
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={runAIAssignment}
            disabled={selectedTeams.size === 0 || isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Run Assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};