import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  scopeType: "contractor" | "sub_contractor";
  value: string;
  onChange: (id: string, label?: string) => void;
}

interface Row { id: string; label: string; sub?: string }

/**
 * Searchable picker for the penalty rule scope.
 * - contractor: searches profiles whose role is contractor (full_name / contractor_id / email).
 * - sub_contractor: searches profiles whose role is sub_contractor (full_name / email).
 * Stores the selected user_id (uuid) for sub_contractor, or contractor_id (text) for contractor.
 */
export const ScopePicker = ({ scopeType, value, onChange }: Props) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>("");

  // Load label for an already-selected value
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!value) { setSelectedLabel(""); return; }
      if (scopeType === "sub_contractor") {
        const { data } = await supabase.from("profiles").select("full_name,email").eq("id", value).maybeSingle();
        if (!cancelled && data) setSelectedLabel(`${data.full_name || "Unknown"} (${data.email || "—"})`);
      } else {
        const { data } = await supabase.from("profiles").select("full_name,contractor_id").eq("contractor_id", value).limit(1).maybeSingle();
        if (!cancelled) setSelectedLabel(data ? `${data.full_name || value} [${value}]` : value);
      }
    })();
    return () => { cancelled = true; };
  }, [value, scopeType]);

  const search = async () => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", scopeType as any);
      const ids = (roles || []).map(r => r.user_id);
      if (ids.length === 0) { setResults([]); return; }
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, contractor_id")
        .in("id", ids)
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,contractor_id.ilike.%${q}%`)
        .limit(15);
      const rows: Row[] = (data || []).map((p: any) => scopeType === "sub_contractor"
        ? { id: p.id, label: p.full_name || "Unknown", sub: p.email }
        : { id: p.contractor_id || p.id, label: p.full_name || "Unknown", sub: p.contractor_id || p.email });
      setResults(rows);
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <Badge variant="secondary" className="gap-1 max-w-full">
          <span className="truncate">{selectedLabel || value}</span>
          <button type="button" onClick={() => onChange("", "")}><X className="h-3 w-3 ml-1" /></button>
        </Badge>
      ) : null}
      <div className="flex gap-2">
        <Input
          placeholder={scopeType === "contractor" ? "Search contractor name / ID…" : "Search sub-contractor name / email…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
        />
        <Button type="button" variant="outline" size="icon" onClick={search} disabled={loading}>
          <Search className="h-4 w-4" />
        </Button>
      </div>
      {results.length > 0 && (
        <ul className="border rounded-md max-h-48 overflow-auto text-xs divide-y">
          {results.map(r => (
            <li key={r.id} className="flex items-center justify-between p-2 hover:bg-muted/50 cursor-pointer" onClick={() => { onChange(r.id, r.label); setResults([]); setQ(""); }}>
              <div className="min-w-0">
                <div className="font-medium truncate">{r.label}</div>
                {r.sub && <div className="text-muted-foreground truncate">{r.sub}</div>}
              </div>
              <Button type="button" size="sm" variant="ghost">Select</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};