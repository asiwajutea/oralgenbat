import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AdvancedFilterState,
  emptyAdvancedFilter,
  FailureToken,
  isAdvancedFilterActive,
} from "@/lib/parseFailureReasons";

const CATEGORY_TOKENS: { token: FailureToken; label: string }[] = [
  { token: "field_audit", label: "Field Audit" },
  { token: "metadata", label: "Metadata" },
  { token: "pdf", label: "PDF / Artifact" },
];

const Q_TOKENS: FailureToken[] = Array.from({ length: 14 }, (_, i) => `Q${i}` as FailureToken);

interface Props {
  value: AdvancedFilterState;
  onChange: (next: AdvancedFilterState) => void;
}

export const AdvancedFiltersPanel = ({ value, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  const active = isAdvancedFilterActive(value);

  const toggleReason = (tok: FailureToken) => {
    const next = value.reasons.includes(tok)
      ? value.reasons.filter((r) => r !== tok)
      : [...value.reasons, tok];
    onChange({ ...value, reasons: next });
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant={active ? "default" : "outline"} size="sm" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Advanced
            {active && <Badge variant="secondary" className="ml-1 h-5 px-1.5">{countActive(value)}</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(92vw,520px)] max-h-[80vh] overflow-y-auto" align="end">
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Failure reasons</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {CATEGORY_TOKENS.map((c) => (
                  <label key={c.token} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={value.reasons.includes(c.token)} onCheckedChange={() => toggleReason(c.token)} />
                    {c.label}
                  </label>
                ))}
              </div>
              <div className="mt-2">
                <Label className="text-xs text-muted-foreground">Checklist questions</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {Q_TOKENS.map((q) => {
                    const on = value.reasons.includes(q);
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => toggleReason(q)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                        }`}
                      >
                        {q}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2">
                <Label className="text-xs text-muted-foreground">Match mode</Label>
                <Select value={value.matchMode} onValueChange={(v) => onChange({ ...value, matchMode: v as "includes" | "only" })}>
                  <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="includes">Reasons INCLUDE any selected</SelectItem>
                    <SelectItem value="only">Reasons are ONLY the selected (exact)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Field Manager</Label>
                <Input className="h-8" value={value.fieldManager} onChange={(e) => onChange({ ...value, fieldManager: e.target.value })} placeholder="Search…" />
              </div>
              <div>
                <Label className="text-xs">Contractor</Label>
                <Input className="h-8" value={value.contractorId} onChange={(e) => onChange({ ...value, contractorId: e.target.value })} placeholder="NGXX" />
              </div>
              <div>
                <Label className="text-xs">Interviewer</Label>
                <Input className="h-8" value={value.interviewerCode} onChange={(e) => onChange({ ...value, interviewerCode: e.target.value })} placeholder="Code" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Date field</Label>
                <Select value={value.dateField} onValueChange={(v) => onChange({ ...value, dateField: v as any })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uploaded_at">Uploaded</SelectItem>
                    <SelectItem value="reviewed_at">Reviewed</SelectItem>
                    <SelectItem value="last_modified">Last modified</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" className="h-8" value={value.startDate} onChange={(e) => onChange({ ...value, startDate: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" className="h-8" value={value.endDate} onChange={(e) => onChange({ ...value, endDate: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Re-audit count</Label>
                <Select value={value.reAuditBucket} onValueChange={(v) => onChange({ ...value, reAuditBucket: v as any })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="0">0 (never re-audited)</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2plus">2 or more</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Burn history</Label>
                <Select value={value.burnHistory} onValueChange={(v) => onChange({ ...value, burnHistory: v as any })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="never">Never burned</SelectItem>
                    <SelectItem value="ever">Ever burned</SelectItem>
                    <SelectItem value="current">Currently burned</SelectItem>
                    <SelectItem value="restored">Previously burned (restored)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-between pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={() => onChange(emptyAdvancedFilter)}>
                Clear all
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {active && (
        <Button variant="ghost" size="sm" onClick={() => onChange(emptyAdvancedFilter)} className="gap-1 text-xs">
          <X className="h-3 w-3" /> Clear
        </Button>
      )}
    </div>
  );
};

function countActive(f: AdvancedFilterState): number {
  let n = 0;
  if (f.reasons.length) n++;
  if (f.fieldManager) n++;
  if (f.contractorId) n++;
  if (f.interviewerCode) n++;
  if (f.startDate || f.endDate) n++;
  if (f.reAuditBucket !== "any") n++;
  if (f.burnHistory !== "any") n++;
  return n;
}