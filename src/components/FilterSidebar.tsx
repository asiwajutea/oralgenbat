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
import { useAuth } from "@/contexts/AuthContext";

interface FilterSidebarProps {
  onFilterChange: (filters: FilterState) => void;
  onClose?: () => void;
  initialFilters?: Partial<FilterState>;
}

export interface FilterState {
  statuses: string[];
  interviewId: string;
  reviewer: string;
  interviewerId: string;
  startDate: string;
  endDate: string;
}

const STORAGE_KEY = "interview-filters";

const getStoredFilters = (userId: string): FilterState | null => {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}-${userId}`);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to parse stored filters:", e);
  }
  return null;
};

const storeFilters = (userId: string, filters: FilterState) => {
  try {
    localStorage.setItem(`${STORAGE_KEY}-${userId}`, JSON.stringify(filters));
  } catch (e) {
    console.error("Failed to store filters:", e);
  }
};

const clearStoredFilters = (userId: string) => {
  try {
    localStorage.removeItem(`${STORAGE_KEY}-${userId}`);
  } catch (e) {
    console.error("Failed to clear stored filters:", e);
  }
};

export const FilterSidebar = ({ onFilterChange, onClose, initialFilters }: FilterSidebarProps) => {
  const { user, userRole } = useAuth();
  const userId = user?.id || "anonymous";
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  
  const defaultFilters: FilterState = {
    statuses: [],
    interviewId: "",
    reviewer: "",
    interviewerId: "",
    startDate: "",
    endDate: "",
  };

  // Initialize from localStorage or defaults
  const [filters, setFilters] = useState<FilterState>(() => {
    const stored = getStoredFilters(userId);
    if (stored) {
      return { ...stored, ...initialFilters };
    }
    return { ...defaultFilters, ...initialFilters };
  });
  
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  const { data: statusCounts } = useStatusCounts();

  // Check if user is in a role that should see Ready for Review filter
  const showReadyForReview = userRole === 'super_admin' || userRole === 'sub_contractor' || userRole === 'field_manager';
  
  // Build status options dynamically based on role
  const statusOptions = [
    { value: "Pending", label: `Awaiting Review (${statusCounts?.counts?.Pending || 0})` },
    ...(showReadyForReview ? [{ value: "Ready for Review", label: `Ready for Review (${statusCounts?.counts?.["Ready for Review"] || 0})` }] : []),
    { value: "Re-Audit", label: `Re-Audit (${statusCounts?.counts?.["Re-Audit"] || 0})` },
    { value: "In Progress", label: `In Progress (${statusCounts?.counts?.["In Progress"] || 0})` },
    { value: "Audit Passed", label: `Audit Passed (${statusCounts?.counts?.["Audit Passed"] || 0})` },
    { value: "Audit Failed", label: `Audit Failed (${statusCounts?.counts?.["Audit Failed"] || 0})` },
  ];

  // Load stored filters on mount
  useEffect(() => {
    const stored = getStoredFilters(userId);
    if (stored) {
      const mergedFilters = { ...stored, ...initialFilters };
      setFilters(mergedFilters);
      // Notify parent of loaded filters
      onFilterChange(mergedFilters);
    } else if (initialFilters) {
      setFilters(prev => ({ ...prev, ...initialFilters }));
      onFilterChange({ ...defaultFilters, ...initialFilters });
    }
    setInitialized(true);
  }, [userId]);

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

  // Store filters whenever they change (after initialization)
  useEffect(() => {
    if (initialized) {
      storeFilters(userId, filters);
    }
  }, [filters, userId, initialized]);

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
    clearStoredFilters(userId);
  };

  return (
    <aside className="w-full sm:w-[336px] h-full border-l bg-card p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex flex-col">
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
              {[...reviewers].sort((a, b) => a.localeCompare(b)).map((reviewer) => (
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