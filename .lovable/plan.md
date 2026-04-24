## 1. Exclude burned interviews from role dashboards ("My Dashboard")

The dedicated role dashboards still pull burned audits because they don't subtract `burn_queue.audit_id` (where `restored_at IS NULL`). Apply the same filter pattern used elsewhere.

Files to update:

| File | Where |
|---|---|
| `src/pages/FieldManagerDashboard.tsx` | `teamAudits` query + `overrideAudits` query |
| `src/pages/ContractorDashboard.tsx` | `audits` query |
| `src/components/home/AuditorDashboard.tsx` | `recentlyApproved`, `inProgressInterviews`, `reAuditInterviews`, `pendingCount` |
| `src/components/home/ContractorDashboard.tsx` | `recentActivity` query (and any other audit list/stat) |

Approach: add a small shared `useQuery` keyed `["burned-audit-ids"]` that selects `audit_id` from `burn_queue` where `restored_at IS NULL` (60s `staleTime`), then filter the audit lists client-side. For `pendingCount` (currently a `head/count` query), switch to a list-of-ids query and compute `.length` after filtering.

Stats derived from `audits` follow automatically because they read the filtered list.

Out of scope: `Index.tsx`, `InterviewTracking.tsx`, `AdminDashboard`, `QAManagerDashboard`, `DataEntryClerkDashboard` already exclude burns via direct queries or RPCs.

## 2. Restore-from-burn dialog: optional re-audit + special note

### Database

Add a column `re_audit_note text` (nullable) to `re_audit_submissions` so a one-shot instruction from the requester travels with the submission and is shown on the review page.

> Why a separate column: `submission_comment` is already used for the technical/audit message in re-audit history; the note is a distinct human instruction to the reviewer. Keeping them separate avoids overloading meaning and keeps existing UI intact.

Update the existing RPC `mark_audit_for_reaudit` to accept an optional `_re_audit_note text DEFAULT NULL` and store it on the inserted row. Backwards-compatible with all existing callers.

### `BurnQueue.tsx` — restore dialog

Replace the inline single-row restore with a new local dialog (`RestoreFromBurnDialog`).

Dialog UI:
- Title: *Restore Interview*
- Radio group:
  - **Just restore** (default) — interview returns to its prior status, no re-audit triggered.
  - **Restore and send for re-audit immediately** — interview is restored, status flipped to `Awaiting Review`, `is_re_audit = true`, `re_audit_count` incremented, prior checklist progress wiped (mirrors the failed-modal flow).
- Optional textarea **Special note for the reviewer (optional)** (max 1,000 chars). Subtitle: *"Visible to the next auditor as a closable banner. Includes your name."*
- Submit / Cancel.

Behaviour on submit:
- **Just restore**: existing path — `update burn_queue set restored_at, restored_by`. If a note was entered, also `insert into re_audit_submissions (audit_id, submitted_by, submitted_by_role, replaced_pdf:false, replaced_zip:false, submission_comment: 'Restored from burn queue (no re-audit requested)', re_audit_note: <note>)` so the note is captured and shown to whoever opens the interview next.
- **Restore + re-audit**: do the burn-queue update, then call `supabase.rpc('mark_audit_for_reaudit', { _audit_id, _submitted_by, _submitted_by_role, _comment: 'Restored from burn queue and resubmitted for re-audit', _re_audit_note: <note or null> })`. Additionally `delete from audit_checklist_progress where audit_id = _audit_id` to mirror the failed-modal flow.

Bulk restore:
- Stays simple ("Just restore" semantics, no per-row note prompt) — avoids a confusing dialog flow per row. We update the bulk button tooltip to make this clear: *"Bulk restore returns interviews to their previous status. Use the row action for per-interview options."*

### `FailedInterviewModal.tsx` — "Request Re-Audit (No Correction)" path

Today the button passes a hard-coded `submissionComment` into `mark_audit_for_reaudit`. Add a special-note flow:

- Add a small textarea **Special note for the reviewer (optional)** directly above the existing "Request Re-Audit (No Correction)" button. Use a new state `reauditNote` (the existing `comment` field is the regular submission comment for the file-replace path and stays unchanged).
- When the no-correction button is clicked, call the RPC with `_re_audit_note: reauditNote || null`. Existing comment composition is preserved.
- The regular file-replace submission keeps using `submission_comment` only and is unaffected.

## 3. Special-note banner on the review page

Add `src/components/review/ReAuditNoteBanner.tsx`:

- Props: `auditId: string`.
- Internally: `useQuery` keyed `["reaudit-note", auditId]` selects the most recent `re_audit_submissions` row where `audit_id = auditId AND re_audit_note IS NOT NULL` ordered by `submitted_at desc limit 1`. Separately fetches the submitter's `full_name` from `profiles`.
- Renders a dismissible amber `Alert` (`AlertCircle` icon) with:
  - Title: *Special note from {full_name}* (fallback: "team member")
  - Body: the note, `whitespace-pre-wrap`
  - Subtle timestamp ("Sent <relative>")
  - **X** close button. Dismissal stored per-submission in `sessionStorage` (`reaudit-note-dismissed:{submission_id}`) so reopening the page later re-shows the note — we don't want the auditor to lose it permanently.
- Self-hides when no note exists, so it's a no-op for normal re-audits.

Integration in `src/pages/ReviewInterview.tsx`:
- Render `<ReAuditNoteBanner auditId={auditId!} />` only when `audit?.is_re_audit === true && audit?.status === 'Awaiting Review'`. Place it directly above `<FraudFlagBanner …/>` inside the sticky checklist section so the auditor sees it before starting the checklist.

## Files

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | Add `re_audit_note text` to `re_audit_submissions`; replace `mark_audit_for_reaudit` to accept `_re_audit_note text default null` |
| `src/pages/BurnQueue.tsx` | New restore dialog (single-row), bulk restore unchanged |
| `src/components/tracking/FailedInterviewModal.tsx` | Add `reauditNote` state + textarea above no-correction button; pass to RPC |
| `src/pages/FieldManagerDashboard.tsx` | Filter out burned audits |
| `src/pages/ContractorDashboard.tsx` | Filter out burned audits |
| `src/components/home/AuditorDashboard.tsx` | Filter out burned audits in all four queries |
| `src/components/home/ContractorDashboard.tsx` | Filter `recentActivity` against burns |
| `src/components/review/ReAuditNoteBanner.tsx` | New banner component |
| `src/pages/ReviewInterview.tsx` | Mount the banner above `FraudFlagBanner` for re-audit awaiting review |

## Out of scope

- Per-row note prompt inside bulk restore — bulk stays as a simple "just restore" action.
- Permanently dismissing notes — we use session storage so the next visit re-shows it.
- Extra notification channel when a special note is added — covered by the existing re-audit notification flow.
- Changes to `ReAuditDialog.tsx` (contractor file-replace dialog) — not in user's request.
