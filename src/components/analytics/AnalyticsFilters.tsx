import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, RotateCcw } from "lucide-react";
import { format, subDays, subMonths, startOfDay, endOfDay } from "date-fns";
import { AnalyticsFilters as FilterState } from "@/hooks/useAnalytics";
import { cn } from "@/lib/utils";

interface AnalyticsFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

export const AnalyticsFilters = ({ filters, onFiltersChange }: AnalyticsFiltersProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handlePresetChange = (preset: 'week' | 'month' | '3months') => {
    const end = endOfDay(new Date());
    let start: Date;

    switch (preset) {
      case 'week':
        start = startOfDay(subDays(end, 7));
        break;
      case 'month':
        start = startOfDay(subMonths(end, 1));
        break;
      case '3months':
        start = startOfDay(subMonths(end, 3));
        break;
    }

    onFiltersChange({
      ...filters,
      dateRange: { start, end, preset },
    });
  };

  const handleReset = () => {
    onFiltersChange({
      dateRange: {
        start: startOfDay(subMonths(new Date(), 1)),
        end: endOfDay(new Date()),
        preset: 'month',
      },
      contractors: [],
      statuses: [],
      interviewers: [],
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card border rounded-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Period:</span>
        <Select value={filters.dateRange.preset} onValueChange={(value: any) => handlePresetChange(value)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Last 7 Days</SelectItem>
            <SelectItem value="month">Last 30 Days</SelectItem>
            <SelectItem value="3months">Last 3 Months</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filters.dateRange.preset === 'custom' && (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("justify-start text-left font-normal")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(filters.dateRange.start, 'MMM dd, yyyy')} - {format(filters.dateRange.end, 'MMM dd, yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: filters.dateRange.start, to: filters.dateRange.end }}
              onSelect={(range) => {
                if (range?.from && range?.to) {
                  onFiltersChange({
                    ...filters,
                    dateRange: {
                      start: startOfDay(range.from),
                      end: endOfDay(range.to),
                      preset: 'custom',
                    },
                  });
                  setIsOpen(false);
                }
              }}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      )}

      <div className="flex-1"></div>

      <Button variant="outline" size="sm" onClick={handleReset}>
        <RotateCcw className="h-4 w-4 mr-2" />
        Reset
      </Button>
    </div>
  );
};
