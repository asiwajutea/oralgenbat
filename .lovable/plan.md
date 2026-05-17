# Plan — 5 enhancements

## 1. Advanced Filter (Tracking + Admin Review pages)

Add an "Advanced Filters" collapsible panel inside the existing filter sidebar / filter bar on both `src/pages/InterviewTracking.tsx` and `src/pages/AdminReviewHistory.tsx`.

**Dimensions (per user selection):**

- **Failure reasons + match mode**
  - Categories: `Field Audit`, `Metadata`, `PDF / Artifact`, `Checklist Question (Q0–Q13 multi-pick)`
  - Match mode toggle:
    - `INCLUDES` — failure reasons contain any of the selected categories
    - `ONLY` — failure reasons are exactly the selected set (no others)
  - Source of truth: `audits.review_comment` parsed for `Q#:` markers + `audits.artifact_correction` array (`pdf`, `metadata`, `field_audit`) for the P/M/F/B flags already used elsewhere, plus AVTool field-audit failure flag.
- **People**
  - Field Manager (from `interview_metadata.field_manager` or `interview_fm_overrides`)
  - Contractor (`contractor_id`)
  - Interviewer code
- **Date range on a chosen event**: dropdown to pick which date column to filter on (`uploaded_at`, `reviewed_at`, `last_modified`) + start/end pickers.
- **Re-audit count + burn history**
  - Re-audits: `0`, `1`, `2+`
  - Burn history: `Never burned`, `Ever burned`, `Currently burned`, `Previously burned (restored)`

**UX**: Active filter chips shown above the table with a one-click clear. Persist to localStorage alongside existing `FilterSidebar` storage. URL is not changed.

**Scope**: Frontend-only filtering on already-fetched rows where possible; the failure-reason parsing uses `review_comment` text and `artifact_correction` array — both already in the audits row.

## 2. Super Admin Homepage "Failed" count (112 vs 76 → fix to 76)

Root cause: `src/components/home/AdminDashboard.tsx` counts every `status === "Audit Failed"` in `audits`, but Tracking excludes audits whose `id` appears in `burn_queue` (any state in the active query, currently `restored_at IS NULL`).

**Fix**: In the AdminDashboard stats query, fetch the set of burned (non-restored) audit IDs (same query Tracking uses) and exclude them from the `failed` count. Apply the same exclusion consistently to passed / pending so totals reconcile. Also exclude audits with later successful re-audit if Tracking does (verify in same change).

## 3. Burn-history fire icons

In the Tracking interviews table row (and any list using `AuditTable`):

- Add a small fire icon (`Flame`) next to the interview ID/name when its `audit_id` has ANY row in `burn_queue` (ever burned).
  - `restored_at IS NULL` (currently in burn) → **red** icon, tooltip "Currently in burn queue".
  - `restored_at IS NOT NULL` (previously burned, now restored) → **blue** icon, tooltip "Previously burned — restored on {date}".
- A single batched query: `select audit_id, max(sent_at), bool_or(restored_at is null) as currently_burned from burn_queue where audit_id in (...) group by audit_id`. Cache via React Query.
- Note: items "currently burned" are already excluded from Tracking listing — so in practice Tracking will mostly show the blue (restored) icon. Burn Queue page itself can use the red icon for currently-burned rows.

## 4. Unassigned-agent recurring nag

**Definition**: An interviewer code present in `interview_metadata` (or `team_assignments`) that has no active row linking it to a Field Manager — i.e. shows up in the existing `unassignedInterviewers` query on `src/pages/TeamApprovals.tsx`.

**Behavior**: When user role is `admin`, `sub_contractor`, or `super_admin`, and the unassigned-agent count > 0:

- Show a modal at login (after the existing LoginWelcomeModal) listing the unassigned agents with a CTA "Go to Team Approvals".
- Recurring timer: re-open the modal every 30 minutes during the session as long as the count remains > 0. Reset the timer when the user assigns someone (refetch on `TeamApprovals` mutation success invalidates the count → if zero, timer stops).
- Dismiss button closes the current modal but does not stop the timer.
- Component: new `src/components/UnassignedAgentNagModal.tsx`, mounted in `Layout.tsx` behind a role check.

## 5. Penalty Charges page — add summary cards

In `src/pages/MyPenalties.tsx` (and the admin equivalent `src/pages/PenaltyAdmin.tsx` if applicable), add a row of `SummaryCard`s at the top:

- **Total charged** (lifetime, per currency)
- **Total paid** (lifetime)
- **Outstanding balance** (highlight red if > 0)
- **Open charges count**
- **Payment records count** (lifetime)
- **Last payment date**

Data already comes from `get_penalty_summary` RPC + `penalty_payments` table. Reuse `src/components/analytics/SummaryCard.tsx`.

---

## Technical notes

- No DB migrations needed; all data exists.
- React Query keys: add `["burn-history", auditIds]` for the icon lookup; reuse `unassignedInterviewers` query key for the nag.
- Mobile: advanced filter panel collapses inside existing mobile sheet; fire icon shown inline with name (already-mobile-friendly accordion pattern preserved).
- Failure-reason parsing helper: new `src/lib/parseFailureReasons.ts` returning `Set<"field_audit"|"metadata"|"pdf"|`Q${n}`>` from a row.

## Out of scope

- Changing burn-queue retention or workflow.
- Backend changes to `get_review_stats` (homepage fix is client-side exclusion).
- Redesigning the existing filter sidebar — only adding an "Advanced" section.
