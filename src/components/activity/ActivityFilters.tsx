import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";

export interface ActivityFilterState {
  startDate: string;
  endDate: string;
  search: string;
  actionTypes: string[];
}

interface Props {
  value: ActivityFilterState;
  onChange: (next: ActivityFilterState) => void;
  availableActions: { value: string; label: string }[];
}

export const ActivityFilters = ({ value, onChange, availableActions }: Props) => {
  const [open, setOpen] = useState(true);

  const toggleAction = (a: string) => {
    const has = value.actionTypes.includes(a);
    onChange({
      ...value,
      actionTypes: has ? value.actionTypes.filter(x => x !== a) : [...value.actionTypes, a],
    });
  };

  const clearAll = () => onChange({ startDate: "", endDate: "", search: "", actionTypes: [] });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Filter className="h-4 w-4" /> Filters
        </CardTitle>
        <div className="flex items-center gap-2">
          {(value.startDate || value.endDate || value.search || value.actionTypes.length > 0) && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)}>
            {open ? "Hide" : "Show"}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={value.startDate}
                onChange={e => onChange({ ...value, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={value.endDate}
                onChange={e => onChange({ ...value, endDate: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Search description / entity</Label>
            <Input
              placeholder="e.g. NG71_711..."
              value={value.search}
              onChange={e => onChange({ ...value, search: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Action types</Label>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {availableActions.map(a => {
                const active = value.actionTypes.includes(a.value);
                return (
                  <Badge
                    key={a.value}
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleAction(a.value)}
                  >
                    {a.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};