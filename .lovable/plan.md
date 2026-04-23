

## Auto Fraud Detection on Review Page + Q14 Fraud Question

### Goal
When an auditor opens an interview, automatically check whether the same agent conducted **another interview within 30 minutes on the same day** and:
1. Show a clear fraud-flag banner on the review page listing the colliding interview(s).
2. Add a **new checklist question (Q14)**: *"Do you believe this interview contains any fraud or padding?"* — defaults to **Yes** when auto-flagged, otherwise **No**. Auditor can override either way.
3. Existing **Pass-with-Override** flow already lets auditors pass flagged interviews — no change needed there.

### Detection logic (server-side RPC)

New RPC `detect_interview_fraud_flag(p_audit_id uuid)` returns:

| Column | Meaning |
|---|---|
| `is_flagged` | true when ≥1 collision found |
| `interviewer_code` | parsed from current interview |
| `interview_date` | parsed |
| `interview_time` | parsed |
| `collisions` | jsonb array `[{audit_id, file_name, total_names, interview_time, minutes_apart}]` |

Steps inside the RPC:
1. Look up current `interview_metadata` for `p_audit_id` to get `contractor_id`, `interviewer_code`, `interview_date`, `interview_time`.
2. If any of those is missing, fall back to parsing `audits.file_name` with the standard `NGXX_XXXX_YYYYMMDD_HHMM` pattern.
3. Find other rows in `interview_metadata` where:
   - same `interviewer_code` (and same `contractor_id` when available)
   - same `interview_date`
   - `audit_id <> p_audit_id`
   - `ABS(EXTRACT(EPOCH FROM (interview_time - p_time))) <= 1800` (30 minutes)
   - audit not in `burn_queue` (active)
4. Return collisions joined with `audits.file_name` and `interview_metadata.total_names`, ordered by minutes_apart ascending.

`SECURITY DEFINER`, `STABLE`, granted to `authenticated`.

> Note: this is a read-only flag. We will **not** mutate audit status here. The "automatic flag" is computed on the fly each time the page loads, so it stays correct as new uploads arrive.

### Frontend

**New component** `src/components/review/FraudFlagBanner.tsx`
- Red/amber `Alert` with `AlertTriangle` icon.
- Header: *"Possible fraud detected — same agent ran another interview within 30 minutes."*
- Lists each collision: file name (linked to that review page), total names, interview time, minutes apart.
- Hidden when `is_flagged === false` or query is loading.

**`ReviewInterview.tsx`**
- New `useQuery` keyed on `["fraud-flag", auditId]` calling the RPC. `enabled` only after `metadata` is loaded. Stale time 5 min.
- Render `<FraudFlagBanner …/>` directly above the `AuditChecklist` inside the sticky section (so auditors see it even after scrolling).
- Pass `autoFlagged: boolean` into `<AuditChecklist />` so it knows to default Q14 to "yes".

**`AuditChecklist.tsx`**
- Add Q14 to `CHECKLIST_ITEMS`:
  ```
  { id: 14, category: "D", categoryLabel: "Fraud Check",
    question: "Do you believe this interview contains any fraud or padding (e.g. rushed entry, duplicated content, suspicious timing)?" }
  ```
  Note: question semantics are **inverted** — "Yes" = fraud suspected (a failure), "No" = clean.
- Treat Q14 as a failure when answer === `"yes"` (opposite of the other questions). Update the failure-counting logic in `proceedToNext`/summary to special-case `id === 14`.
- New prop `autoFlagged?: boolean`. When true and Q14 is reached for the first time (no saved answer yet), pre-select `"yes"` and **auto-open the comment box** with placeholder *"Describe the suspected fraud (auto-flagged due to <N> close interview(s))…"*. Auditor can switch the radio to "No" to override.
- The comment captured here flows into the existing `failure_comments` block under section **D: Fraud Check**, which already feeds `ReviewActions` → `pass_override_reason` / fail comment formatting.
- Add category "D" color to `getCategoryColor` (red): `bg-red-500/10 text-red-600 border-red-500/20` (replaces the current emerald "D" placeholder).

**`ReviewActions.tsx`** — no logic changes. Existing pass / fail / pass-with-override paths already consume `checklistComments` and `hasChecklistFailures`, so a Q14 "yes" naturally:
- counts as a checklist failure → same prompt to fail or pass-with-override
- the failure comment lists Q14 in section D so the override reason captures it

### Files

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | Create `detect_interview_fraud_flag` RPC + grant |
| `src/components/review/FraudFlagBanner.tsx` | New banner component |
| `src/pages/ReviewInterview.tsx` | Fetch fraud flag, render banner above checklist, pass `autoFlagged` |
| `src/components/review/AuditChecklist.tsx` | Add Q14, inverted-answer handling, `autoFlagged` default, category D color |

### Out of scope
- No persistent "fraud_flagged" column on `audits` (flag is recomputed live).
- No cross-day or cross-agent detection; collisions limited to same agent + same date + ≤30 min.
- No changes to existing fraud analytics dashboards or AI fraud narrative — those keep working as-is.
- No edits to `ReviewActions.tsx` — existing pass/fail/override flow already covers flagged interviews.

