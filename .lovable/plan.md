## 1. Sub-contractor & all roles can Reassign FM

**Bug**: `get_assignable_field_managers` RPC returns nothing for sub-contractors (and any user without `contractor_id`/`active_contractor_id` on their profile), so the dropdown errors with "Failed to load".

**Fix**: New migration to replace the function so it:
- For **sub_contractor**: returns FMs whose contractor_id matches any contractor the SC oversees (via `user_contractor_assignments`), falling back to the assigned FM list.
- For **contractor**: returns FMs whose contractor_id matches the caller's contractor or any `user_contractor_assignments` row.
- For **field_manager**: returns all FMs that share at least one contractor scope with the caller (so an FM can hand off to peers).
- For **admin/super_admin**: unchanged (all FMs, optional `_for_contractor` scope).
- For other approved roles (data_entry, auditor, qa_manager): returns the same scoped list as their contractor.
- Always guarantees at least an empty array (never `RETURN;` with no rows when caller is authenticated).

Also: in `ReassignFMDialog.tsx`, surface the real error message in the toast/retry text and keep the existing retry button.

## 2. Upload Controls — searchable pickers + global lock exemptions

### Migration
- New table `upload_lock_exemptions(scope_type, scope_id)` storing per-user or per-role exemptions to the **global** lock.
  - `scope_type` enum: `'user' | 'role'`.
- New RPC `is_upload_allowed(_user_id uuid)` (or update existing checker) to consult exemptions before honoring the global lock.

### `src/pages/UploadControls.tsx`
- Replace plain `Input` for `scope_id` (locks + quotas) with a new shared `<ScopePicker>` (already partially present at `src/components/penalty/ScopePicker.tsx`) extended to support:
  - **interviewer** → searchable list of interviewer codes from `interview_metadata`.
  - **field_manager** → searchable list from `profiles` joined with `user_roles='field_manager'`.
  - **contractor** → searchable list of contractor IDs/names.
  - **user** → searchable profile list.
- Add a new "Global lock exemptions" card (visible only when global lock is on or being configured). Two tabs/sub-sections:
  - "Exempt specific users" — multi-select user search.
  - "Exempt entire role" — multi-select role chips (interviewer, field_manager, contractor, sub_contractor, data_entry_clerk, auditor, qa_manager, admin, super_admin).
- Wire enforcement: `src/components/upload/UploadLockGuard.tsx` and `useUploadLockStatus` consult the new exemption RPC.

## 3. Centralize uploads — Upload Center is the only entry point

Hide (do not delete) upload-launching UI in:
- `src/pages/Index.tsx` — hide `<UploadDialog>`, `<BulkZipUploadDialog>`, `<CombinedUploadDialog>` trigger buttons.
- `src/pages/InterviewTracking.tsx` — hide `<BulkMetadataUploadDialog>` and `<BulkPdfUploadDialog>` triggers (keep the dialog components mounted-but-hidden so any code path that already opens them programmatically still works).
- Anywhere else a CTA opens these dialogs (search for `setUploadOpen|setBulkZipOpen|setCombinedOpen|setBulkPdfOpen|setBulkMetadataOpen`).

Mechanism: wrap each trigger in `{false && ( ... )}` or a single `SHOW_LEGACY_UPLOAD_BUTTONS = false` flag so it's easy to re-enable. Add a small inline note linking to `/upload-center` where the trigger used to be (admin-visible only).

Leave **artifact replacement** uploads inside review/tracking dialogs (FailedInterviewModal, MobileZipUpload, BulkPdfUploadDialog used for replacement) untouched — only NEW interview uploads route through Upload Center.

## 4. Interview Review page enhancements

### 4a. Burn flame icon for auditor
- In `src/pages/ReviewInterview.tsx` header, fetch burn status via existing `useBurnHistory` for the current `audit_id` (and/or its folder_name) and render `<BurnHistoryIcon>` next to the file name.

### 4b. Review Feedback history with navigation

**Schema**: new table `review_feedback_history`
- Columns: `audit_id uuid`, `cycle_number int`, `review_comment text`, `action_plan text`, `artifact_correction text[]`, `reviewed_by uuid`, `reviewed_at timestamptz`, `created_at timestamptz default now()`.
- RLS: same read scope as `audits` (admin/auditor/contractor/FM/owner). Insert via trigger only.
- Trigger on `audits`: on UPDATE when `status` transitions to `'Audit Failed'` and `review_comment` is set, insert a snapshot row (cycle = `coalesce(re_audit_count,0)+1`). Backfill once with current failed audits.

**UI** — extend `src/components/review/ReviewCommentsPanel.tsx`:
- Fetch `review_feedback_history` rows for this audit, ordered DESC (most recent first).
- If >1 entry, show prev/next arrows + "Feedback N of M" counter. Current (most recent) shown by default.
- Each entry shows the same fields the panel already shows (reason, action plan, artifact correction badges, reviewed date).

### 4c. Activity history (inside Review Feedback container)

Inside the same `<Card>` as Review Feedback, add a collapsible "Activity since re-audit" sub-section that lists events between the most recent failure and now:
- Source 1: `re_audit_submissions` rows for this audit (replaced PDF / replaced ZIP / re-submitted with no replacement → "Sent back for re-audit without changes").
- Source 2: `user_activity_log` filtered by `entity_type='audit'` and `entity_id=auditId`, action_types like `pdf_replaced`, `metadata_replaced`, `artifact_resolved`, `field_audit_synced`, etc.

Render as a vertical timeline (icon + actor name + action label + relative time + absolute time tooltip), newest first. Hidden behind a "Show activity" toggle to keep the panel compact.

### 4d. Manual "Reparse artifacts" button (auditor)

- New button in the review page header (auditor / admin only): "Reparse artifacts".
- Click → confirmation dialog (warns this re-runs PDF + ZIP processing and overwrites the parsed metadata / photos).
- Action: invoke existing `process-mobile-zip` and `analyze-pdf` edge functions for this audit (use current `audit.file_url` and `audit.mobile_zip_url`). Clear the in-memory cache, then `queryClient.invalidateQueries` for the review page.
- Surface progress via toast ("Reparsing PDF…", "Reparsing mobile ZIP…", "Done").

## Files touched (summary)
- **Migrations**: `get_assignable_field_managers` rewrite; `upload_lock_exemptions` table + `is_upload_allowed` RPC; `review_feedback_history` table + trigger + backfill.
- **Edited**: `src/components/tracking/ReassignFMDialog.tsx`, `src/pages/UploadControls.tsx`, `src/components/penalty/ScopePicker.tsx` (extend or new `src/components/upload/UploadScopePicker.tsx`), `src/components/upload/UploadLockGuard.tsx`, `src/hooks/useUploadLockStatus.ts`, `src/pages/Index.tsx`, `src/pages/InterviewTracking.tsx`, `src/components/review/ReviewCommentsPanel.tsx`, `src/pages/ReviewInterview.tsx`.
- **New**: `src/components/review/ReviewFeedbackHistory.tsx`, `src/components/review/ReviewActivityTimeline.tsx`, `src/components/review/ReparseArtifactsButton.tsx`, `src/components/upload/UploadScopePicker.tsx`, `src/components/upload/GlobalLockExemptions.tsx`.

## Out of scope
- No changes to the actual PDF/ZIP parsing logic in edge functions (the reparse button only re-invokes them).
- No redesign of existing upload dialogs themselves.
- No changes to penalty / inbox / team-assignments work from previous turn.
