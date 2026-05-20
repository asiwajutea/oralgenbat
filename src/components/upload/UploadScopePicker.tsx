import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export type ScopeKind = "interviewer" | "field_manager" | "contractor" | "user";

interface Row { id: string; label: string; sub?: string }

interface Props {
  kind: ScopeKind;
  value: string;
  onChange: (id: string, label?: string) => void;
  placeholder?: string;
}

/** Searchable picker used by Upload Controls (locks, quotas, exemptions). */
export const UploadScopePicker = ({ kind, value, onChange, placeholder }: Props) => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!value) { setSelectedLabel(""); return; }
      if (kind === "interviewer") {
        const { data } = await supabase
          .from("interview_metadata")
          .select("interviewer_code,interviewer_name")
          .eq("interviewer_code", value)
          .limit(1).maybeSingle();
        if (!cancelled) setSelectedLabel(data?.interviewer_name ? `${data.interviewer_name} (${value})` : value);
      } else if (kind === "contractor") {
        const { data } = await supabase
          .from("interview_metadata")
          .select("contractor_id,contractor_business_name")
          .eq("contractor_id", value)
          .limit(1).maybeSingle();
        if (!cancelled) setSelectedLabel(data?.contractor_business_name ? `${data.contractor_business_name} (${value})` : value);
      } else {
        const { data } = await supabase.from("profiles").select("full_name,email").eq("id", value).maybeSingle();
        if (!cancelled && data) setSelectedLabel(`${data.full_name || "Unknown"} (${data.email || "—"})`);
      }
    })();
    return () => { cancelled = true; };
  }, [value, kind]);

  const search = async () => {
    setLoading(true);
    try {
      const term = q.trim();
      if (!term && kind !== "field_manager" && kind !== "user") { setResults([]); return; }

      if (kind === "interviewer") {
        const { data } = await supabase
          .from("interview_metadata")
          .select("interviewer_code, interviewer_name")
          .or(`interviewer_code.ilike.%${term}%,interviewer_name.ilike.%${term}%`)
          .limit(50);
        const seen = new Set<string>();
        const rows: Row[] = [];
        for (const r of data || []) {
          if (!r.interviewer_code || seen.has(r.interviewer_code)) continue;
          seen.add(r.interviewer_code);
          rows.push({ id: r.interviewer_code, label: r.interviewer_code, sub: r.interviewer_name || undefined });
        }
        setResults(rows.slice(0, 25));
      } else if (kind === "contractor") {
        const { data } = await supabase
          .from("interview_metadata")
          .select("contractor_id, contractor_business_name")
          .or(`contractor_id.ilike.%${term}%,contractor_business_name.ilike.%${term}%`)
          .limit(50);
        const seen = new Set<string>();
        const rows: Row[] = [];
        for (const r of data || []) {
          if (!r.contractor_id || seen.has(r.contractor_id)) continue;
          seen.add(r.contractor_id);
          rows.push({ id: r.contractor_id, label: r.contractor_id, sub: r.contractor_business_name || undefined });
        }
        setResults(rows.slice(0, 25));
      } else if (kind === "field_manager") {
        const { data: roles } = await supabase
          .from("user_roles").select("user_id").eq("role", "field_manager");
        const ids = (roles || []).map(r => r.user_id);
        if (ids.length === 0) { setResults([]); return; }
        let qb = supabase.from("profiles")
          .select("id, full_name, email")
          .in("id", ids)
          .order("full_name");
        if (term) qb = qb.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
        const { data } = await qb.limit(50);
        setResults((data || []).map(p => ({ id: p.id, label: p.full_name || "Unknown", sub: p.email || undefined })));
      } else {
        // user: any profile
        let qb = supabase.from("profiles")
          .select("id, full_name, email")
          .order("full_name");
        if (term) qb = qb.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
        const { data } = await qb.limit(25);
        setResults((data || []).map(p => ({ id: p.id, label: p.full_name || "Unknown", sub: p.email || undefined })));
      }
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
          placeholder={placeholder || "Search…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
        />
        <Button type="button" variant="outline" size="icon" onClick={search} disabled={loading}>
          <Search className="h-4 w-4" />
        </Button>
      </div>
      {results.length > 0 && (
        <ul className="border rounded-md max-h-56 overflow-auto text-xs divide-y bg-popover">
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