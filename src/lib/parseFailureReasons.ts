/**
 * Extract a set of failure tokens from an audit-ish row.
 * Tokens: "field_audit" | "metadata" | "pdf" | `Q${n}` (0-13)
 */
export type FailureToken = "field_audit" | "metadata" | "pdf" | `Q${number}`;

export function parseFailureReasons(row: {
  artifact_correction?: string[] | null;
  review_comment?: string | null;
}): Set<FailureToken> {
  const out = new Set<FailureToken>();
  for (const a of row.artifact_correction || []) {
    const v = String(a).toLowerCase().trim();
    if (v === "pdf") out.add("pdf");
    else if (v === "metadata") out.add("metadata");
    else if (v === "field_audit" || v === "field-audit" || v === "fieldaudit") out.add("field_audit");
  }
  const text = row.review_comment || "";
  // Match "Q0:", "Q1 -", "Q13:" etc.
  const re = /\bQ(\d{1,2})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (n >= 0 && n <= 13) out.add(`Q${n}` as FailureToken);
  }
  if (/field\s*audit/i.test(text)) out.add("field_audit");
  if (/\bmetadata\b/i.test(text)) out.add("metadata");
  if (/\bpdf\b/i.test(text)) out.add("pdf");
  return out;
}

export type AdvancedFilterState = {
  reasons: FailureToken[];
  matchMode: "includes" | "only";
  fieldManager: string;
  contractorId: string;
  interviewerCode: string;
  dateField: "uploaded_at" | "reviewed_at" | "last_modified";
  startDate: string;
  endDate: string;
  reAuditBucket: "any" | "0" | "1" | "2plus";
  burnHistory: "any" | "never" | "ever" | "current" | "restored";
};

export const emptyAdvancedFilter: AdvancedFilterState = {
  reasons: [],
  matchMode: "includes",
  fieldManager: "",
  contractorId: "",
  interviewerCode: "",
  dateField: "uploaded_at",
  startDate: "",
  endDate: "",
  reAuditBucket: "any",
  burnHistory: "any",
};

export function isAdvancedFilterActive(f: AdvancedFilterState): boolean {
  return (
    f.reasons.length > 0 ||
    !!f.fieldManager ||
    !!f.contractorId ||
    !!f.interviewerCode ||
    !!f.startDate ||
    !!f.endDate ||
    f.reAuditBucket !== "any" ||
    f.burnHistory !== "any"
  );
}

export function matchesAdvancedFilter(
  row: {
    artifact_correction?: string[] | null;
    review_comment?: string | null;
    field_manager?: string | null;
    contractor_id?: string | null;
    interviewer_code?: string | null;
    uploaded_at?: string | null;
    reviewed_at?: string | null;
    last_modified?: string | null;
    re_audit_count?: number | null;
    id?: string;
  },
  f: AdvancedFilterState,
  burnMap?: Map<string, { currently_burned: boolean; restored_at: string | null }>
): boolean {
  if (f.reasons.length > 0) {
    const found = parseFailureReasons(row);
    if (f.matchMode === "includes") {
      if (!f.reasons.some((r) => found.has(r))) return false;
    } else {
      // ONLY: row must contain at least one selected, and no other reasons
      if (!f.reasons.every((r) => found.has(r))) return false;
      for (const tok of found) {
        if (!f.reasons.includes(tok)) return false;
      }
    }
  }
  if (f.fieldManager && !(row.field_manager || "").toLowerCase().includes(f.fieldManager.toLowerCase())) return false;
  if (f.contractorId && !(row.contractor_id || "").toLowerCase().includes(f.contractorId.toLowerCase())) return false;
  if (f.interviewerCode && !(row.interviewer_code || "").toLowerCase().includes(f.interviewerCode.toLowerCase())) return false;

  const dateVal = row[f.dateField];
  if (f.startDate) {
    if (!dateVal || new Date(dateVal) < new Date(f.startDate)) return false;
  }
  if (f.endDate) {
    if (!dateVal) return false;
    const end = new Date(f.endDate);
    end.setHours(23, 59, 59, 999);
    if (new Date(dateVal) > end) return false;
  }

  const rc = row.re_audit_count ?? 0;
  if (f.reAuditBucket === "0" && rc !== 0) return false;
  if (f.reAuditBucket === "1" && rc !== 1) return false;
  if (f.reAuditBucket === "2plus" && rc < 2) return false;

  if (f.burnHistory !== "any" && burnMap && row.id) {
    const entry = burnMap.get(row.id);
    if (f.burnHistory === "never" && entry) return false;
    if (f.burnHistory === "ever" && !entry) return false;
    if (f.burnHistory === "current" && (!entry || !entry.currently_burned)) return false;
    if (f.burnHistory === "restored" && (!entry || entry.currently_burned)) return false;
  }
  return true;
}