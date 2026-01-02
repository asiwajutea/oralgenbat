import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useStatusCounts } from "@/hooks/useStatusCounts";

interface FilterSidebarProps {
  onFilterChange: (filters: FilterState) => void;
  onClose?: () => void;
}

export interface FilterState {
  statuses: string[];
  interviewId: string;
  reviewer: string;
  interviewerId: string;
  startDate: string;
  endDate: string;
}

export const FilterSidebar = ({ onFilterChange, onClose }: FilterSidebarProps) => {
  const [filters, setFilters] = useState<FilterState>({
    statuses: [],
    interviewId: "",
    reviewer: "",
    interviewerId: "",
    startDate: "",
    endDate: "",
  });
  const [reviewers, setReviewers] = useState<string[]>([]);
  const { data: statusCounts } = useStatusCounts();

  const statusOptions = [
    { value: "Pending", label: `Awaiting Review (${statusCounts?.counts?.Pending || 0})` },
    { value: "In Progress", label: `In Progress (${statusCounts?.counts?.["In Progress"] || 0})` },
    { value: "Audit Passed", label: `Audit Passed (${statusCounts?.counts?.["Audit Passed"] || 0})` },
    { value: "Audit Failed", label: `Audit Failed (${statusCounts?.counts?.["Audit Failed"] || 0})` },
  ];

  useEffect(() => {
    const fetchReviewers = async () => {
      const { data, error } = await supabase
        .from("audits")
        .select("reviewed_by")
        .not("reviewed_by", "is", null)
        .order("reviewed_by");

      if (!error && data) {
        const uniqueReviewers = Array.from(
          new Set(data.map((audit) => audit.reviewed_by).filter(Boolean))
        ) as string[];
        setReviewers(uniqueReviewers);
      }
    };

    fetchReviewers();
  }, []);

  const handleStatusChange = (status: string, checked: boolean) => {
    const newStatuses = checked
      ? [...filters.statuses, status]
      : filters.statuses.filter((s) => s !== status);
    
    const newFilters = { ...filters, statuses: newStatuses };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleInputChange = (field: keyof FilterState, value: string) => {
    const newFilters = { ...filters, [field]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleSelectChange = (field: keyof FilterState, value: string) => {
    const actualValue = value === "all" ? "" : value;
    const newFilters = { ...filters, [field]: actualValue };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleReset = () => {
    const resetFilters: FilterState = {
      statuses: [],
      interviewId: "",
      reviewer: "",
      interviewerId: "",
      startDate: "",
      endDate: "",
    };
    setFilters(resetFilters);
    onFilterChange(resetFilters);
  };

  return (
    <aside className="w-[336px] h-full border-l bg-card p-6 space-y-6 overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Filter Results</h2>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium mb-3 block">Interview Status</Label>
          <div className="space-y-3">
            {statusOptions.map((option) => (
              <div key={option.value} className="flex items-center space-x-2">
                <Checkbox
                  id={option.value}
                  checked={filters.statuses.includes(option.value)}
                  onCheckedChange={(checked) =>
                    handleStatusChange(option.value, checked as boolean)
                  }
                />
                <label
                  htmlFor={option.value}
                  className="text-sm cursor-pointer select-none"
                >
                  {option.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="interviewId" className="text-sm font-medium mb-2 block">
            Interview ID (Folder Name)
          </Label>
          <Input
            id="interviewId"
            placeholder="Search by ID..."
            value={filters.interviewId}
            onChange={(e) => handleInputChange("interviewId", e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="reviewer" className="text-sm font-medium mb-2 block">
            Reviewer
          </Label>
          <Select
            value={filters.reviewer || "all"}
            onValueChange={(value) => handleSelectChange("reviewer", value)}
          >
            <SelectTrigger id="reviewer">
              <SelectValue placeholder="Select a reviewer..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reviewers</SelectItem>
              {reviewers.map((reviewer) => (
                <SelectItem key={reviewer} value={reviewer}>
                  {reviewer}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="interviewerId" className="text-sm font-medium mb-2 block">
            Interviewer ID
          </Label>
          <Input
            id="interviewerId"
            placeholder="Search by interviewer ID..."
            value={filters.interviewerId}
            onChange={(e) => handleInputChange("interviewerId", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="startDate" className="text-sm font-medium mb-2 block">
              Start Date
            </Label>
            <Input
              id="startDate"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleInputChange("startDate", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="endDate" className="text-sm font-medium mb-2 block">
              End Date
            </Label>
            <Input
              id="endDate"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleInputChange("endDate", e.target.value)}
            />
          </div>
        </div>

        <Button
          variant="secondary"
          className="w-full bg-foreground text-background hover:bg-foreground/90"
          onClick={handleReset}
        >
          RESET FILTERS
        </Button>
      </div>
    </aside>
  );
};
