## 1. Activity timeline (Interview Review page)

**Problem**: Timeline only appears when the interview is failed; it doesn't show re-audit submissions (what artifact was replaced, "sent back without changes"); and most rows don't show the actor's name.

**Fix** — update `src/components/review/ReviewFeedbackHistory.tsx` (and rename the visible toggle to "Activity history" so it's clear it's not tied to failure):

- **Always render** the activity section, regardless of audit status or whether `review_feedback_history` is empty. Today it returns `null` when there are no failures. Extract the "Activity history" section into its own card (`ReviewActivityTimeline.tsx`) mounted in `ReviewInterview.tsx` so it shows even when the interview is `Awaiting Review`, `Pending`, or `Audit Passed`.
- **Add missing event sources** so re-audit replacements always show up even if no `user_activity_log` row exists:
  - `re_audit_submissions` → "PDF replaced", "Metadata ZIP replaced", "Sent back for re-audit without changes" (already partly there, keep).
  - `audits.mobile_zip_uploaded_at` change (initial metadata upload) — derived from activity log entry `metadata_uploaded` or fallback to that timestamp.
  - `audits.file_url` change history via `user_activity_log` action types `pdf_replaced`, `pdf_uploaded`, `metadata_replaced`, `metadata_uploaded`, `artifact_resolved`, `fm_reassigned`, `interview_locked`, `interview_unlocked`, `sent_to_burn`, `field_audit_synced`.
  - `audits` status transitions → "Audit Passed", "Audit Failed", "Passed with Override", "Sent for re-audit" — backfilled from `user_activity_log` (entity_type=`audit`).
- **Resolve actor names for every row** by batch-fetching `profiles(id, full_name)` for the union of `user_id` values across `re_audit_submissions.submitted_by`, `user_activity_log.user_id`, and `audits.reviewed_by` / `locked_by` / `uploaded_by`. Pass the resolved name into every event (not just submissions). Show `actor` + role chip for each row.
- **Event labels** become human-readable (e.g. `pdf_replaced` → "PDF replaced", `audit_failed` → "Marked as Failed"). De-dup near-simultaneous rows (same actor + same label within 5s).
- **Sort** newest first, show absolute timestamp on hover, relative time inline.

No DB schema changes required — all sources already exist (`re_audit_submissions`, `user_activity_log`, `profiles`).

## 2. Upload Center — PDF-first, paired-preview UX

**Problem**: Upload Center accepts PDFs + ZIPs in any order, so ZIPs sometimes try to attach before their PDF audit row exists. `/interviews` page already has a nicer paired preview (BulkZipUploadDialog / CombinedUploadDialog).

**Fix** — update `src/pages/UploadCenter.tsx` (new-interview path only; re-audit replacement flow stays as is):

- **Two-phase processing per batch**:
  1. Split selected files into `pdfs` and `zips` by extension/MIME.
  2. Group by base name (`NGXX_XXXX_XXXXXXXX_XXXX`) into a `PairPreview[]`: `{ baseName, pdf?: File, zip?: File, existingAudit?: { id, has_pdf, has_metadata } }`.
  3. Query `audits` once (`.in("file_name", baseNames)`) + `interview_metadata` to compute pairing/duplicate state for each row.
- **Preview table** before upload (mirrors the table in `BulkZipUploadDialog` / `CombinedUploadDialog`) with columns: File name · PDF status (✅ included / 🟡 already uploaded / ❌ missing) · Metadata status · Action (Upload / Skip / Replace) · Reason. Rows where ZIP has no matching PDF (neither in batch nor existing) are flagged "Will skip — no paired PDF" and excluded from the upload run.
- **Upload order**: process all PDFs first (sequentially or limited concurrency), wait for each audit row to be created, then process ZIPs against the now-existing audits. Existing helper `uploadInterviewFile` already inserts the audit row on PDF success; we just need to enforce ordering at the page level.
- Re-use `FloatingUploadProgress` for per-file progress, but add an "Upload summary" panel after completion (uploaded / skipped / failed counts, like `/interviews`).

No new components are strictly required, but extract the pairing logic to `src/lib/pairInterviewFiles.ts` so it can be reused.

## 3. One-click Fail / Pass for re-audits

**Goal**: Save auditor time on re-audits by letting them re-fail or re-pass an audit without walking through all 14 checklist items, while preserving full audit history and visibility for the FM.

**Scope**: Only when `audits.is_re_audit = true` and there is at least one prior cycle in `review_feedback_history` (or a non-null `review_comment` on the current row).

### UI — `src/pages/ReviewInterview.tsx`

Add a new card above the checklist titled **"Quick re-audit decision"** with:

- **"Previous checklist answers"** — collapsible table fetched from `audit_checklist_progress` (most recent reviewer's `items` JSONB) showing Q#, question, prior answer (Pass/Fail), and prior failure comment. Default collapsed; expanded view is read-only.
- **Three actions**:
  1. **Fail — same reasons as last cycle** (one click). Pre-populates the failure payload from the most recent `review_feedback_history` row (`review_comment`, `action_plan`, `artifact_correction`). Opens a confirmation dialog showing the prefilled text; auditor confirms.
  2. **Fail — new reasons** (one click). Opens a lightweight dialog with the same fields used in the normal fail flow (failure comment, artifact_correction checkboxes, optional action plan) — no checklist walk required.
  3. **Pass — all previous issues fixed** (one click). Confirmation dialog; on confirm marks the audit as `Audit Passed`.
- Banner above the actions: "If a new checklist item has failed, run the full checklist instead" with a link/button to fall back to the existing checklist flow.

### Backend behavior (no schema changes)

Re-use existing RPCs/columns where possible:

- **Fail path** (both variants) calls a new RPC `re_audit_quick_fail(_audit_id, _review_comment, _action_plan, _artifact_correction)` which:
  - Sets `audits.status = 'Audit Failed'`, `review_comment`, `action_plan`, `artifact_correction`, `reviewed_by = current user`, `reviewed_at = now()`, `re_audit_count` unchanged (the FM's re-submission already incremented it), `is_re_audit = true`.
  - Inserts into `review_feedback_history` via the existing trigger (already fires on status → Audit Failed with comment set).
  - Writes a `user_activity_log` row with `action_type='audit_quick_failed'` and `metadata.reused_previous_feedback = bool`.
  - Copies the latest `audit_checklist_progress.items` into a new row for this reviewer (so the checklist tab still reflects the recorded answers) — items are marked source: `"carried_over"` in metadata.
- **Pass path** calls `re_audit_quick_pass(_audit_id)`:
  - Sets `audits.status = 'Audit Passed'`, clears `review_comment`/`action_plan`/`artifact_correction`, sets `reviewed_by`/`reviewed_at`.
  - Writes `user_activity_log` row `audit_quick_passed`.
  - Inserts a `pass` snapshot into `audit_checklist_progress` (all items marked Pass, `metadata.source='quick_pass'`).

Both RPCs are `SECURITY DEFINER`, role-gated to `auditor`/`admin`/`super_admin`, and require `is_re_audit = true` and an existing prior cycle.

### Visibility for FM and others

- Failed re-audits show up in `/interviews` and FM dashboards exactly as today (status `Audit Failed`, latest `review_comment`/`action_plan`/`artifact_correction` visible). The new `review_feedback_history` row makes the previous cycles still navigable in the Review Feedback panel.
- The activity timeline (section 1 above) will surface the `audit_quick_failed` / `audit_quick_passed` events with the auditor's name, so FMs see the new decision.

## Files touched

- **Edited**: `src/components/review/ReviewFeedbackHistory.tsx`, `src/pages/ReviewInterview.tsx`, `src/pages/UploadCenter.tsx`.
- **New**: `src/components/review/ReviewActivityTimeline.tsx`, `src/components/review/QuickReAuditDecisionCard.tsx`, `src/components/review/PreviousChecklistTable.tsx`, `src/lib/pairInterviewFiles.ts`.
- **Migration**: two new SECURITY DEFINER RPCs `re_audit_quick_fail` and `re_audit_quick_pass`. No table changes.

## Out of scope

- No changes to the normal checklist flow, no changes to penalty / inbox / team-assignments work, no changes to PDF/ZIP edge function parsing logic.
