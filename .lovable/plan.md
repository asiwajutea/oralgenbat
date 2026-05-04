## Inbox, Chat Policies, Upload Locks & Override Notes

### 1. Inbox — Failed Audits, Tracking, and live toasts

**Problem 1 — Failed Audits / Tracking columns are empty.** The `process-chat-events` edge function only runs when invoked. Triggers enqueue rows into `chat_pending_events`, but nothing drains the queue, so no `failed_audit` or `tracking_comment` conversations are ever created.

**Fix:**
- Drain the queue automatically using a Postgres trigger on `chat_pending_events` that calls a new internal RPC `process_chat_event_inline(_event_id uuid)` written in PL/pgSQL. The RPC mirrors the edge-function logic for `audit_failed`, `tracking_comment_added`, `announcement_published`, and `push_delivered`, then sets `processed_at`. This keeps the system self-healing even if the edge function is never invoked.
- Backfill: one-shot SQL run inside the same migration that loops over current unprocessed events.
- Keep the existing edge function as a fallback (admin-triggered).
- Rename the "Tracking" inbox label/tooltip to "Tracking Comments" and add a one-line subtitle: "Comments left on the Interview Tracking page".

**Problem 2 — No toast for new messages outside Inbox.**
- Add `ChatToastListener` mounted in `App.tsx` (inside `AuthProvider`).
- It subscribes to `chat_messages` INSERT for conversations where the user is a participant, ignores its own messages, ignores when `location.pathname.startsWith('/inbox')`, fetches sender name + conversation title, and calls `toast(...)` with an action button "Open" → `navigate('/inbox?conv=' + id)`.
- Respect `chat_user_preferences.push_enabled` (reuse it as the in-app notify flag too).

### 2. Chat Policies redesign

**a. Persistence bug — "Users can never start a chat conversation with" resets.**
Root cause: blocked users are only saved when the user clicks "Save" in the picker. Closing the policies page or navigating away discards uncommitted state. Also the picker writes to local state but only commits on `commitPicker`.
- Make every checkbox toggle in the picker write through immediately (debounced 300 ms) using `setBlocked()`.
- Reload state after each write so badges reflect persisted DB rows.

**b. Role-based matrix.** Add a new "Role permissions" card (Connecteam-style) to `/admin/chat-policies` letting super_admin define which roles can chat which roles. Backed by the existing `chat_messaging_policies` table (`from_role`, `to_role`, `allowed`).
- UI: 7×7 grid (auditor, field_manager, contractor, sub_contractor, data_entry_clerk, quality_assurance_manager, super_admin/admin row pinned as "always allowed"). Cells are toggle chips with optimistic save.
- `can_message_users` already consults this matrix; no RPC change needed.

**c. Per-user exceptions for "Users can never start a chat conversation with".**
- Migration: extend `chat_user_blocks` with `except_user_ids uuid[] NOT NULL DEFAULT '{}'` representing users who are still allowed to message the blocked user.
- Update `can_message_users` to: when caller is in `except_user_ids` for a recipient, allow; otherwise enforce the block.
- UI: each blocked-user chip becomes expandable. Clicking it opens an "Except…" picker (same dialog, smaller) so the admin can pick exempt senders. The chip then shows `Temidayo Akintuyi · except 3`.

### 3. New Interview Upload Lock & Quotas

New tables and RPC, plus client-side enforcement in all upload dialogs.

**Schema (migration):**
```text
upload_lock_settings
  scope_type text   -- 'global' | 'contractor' | 'field_manager' | 'interviewer'
  scope_id   text   -- contractor_id, field_manager_id (uuid as text), or interviewer_code
  locked     boolean
  reason     text
  set_by     uuid
  updated_at timestamptz
  PRIMARY KEY (scope_type, scope_id)

upload_quota_settings
  scope_type     text       -- 'field_manager' | 'interviewer'
  scope_id       text
  metric         text       -- 'interviews' | 'names'
  limit_value    integer
  reset_at       timestamptz -- exact instant the quota resets (next reset point)
  reset_period   text        -- 'one_off' | 'monthly' | 'weekly' (informational)
  set_by         uuid
  updated_at     timestamptz
  PRIMARY KEY (scope_type, scope_id, metric)
```
RLS: super_admin/admin manage all rows. Contractor/sub_contractor manage rows whose `scope_id` resolves to their contractor (`field_manager_id` joined via `team_assignments.contractor_id`, `interviewer_code` directly). FM and below: read-only for rows that match themselves.

**Counting logic (RPC `get_upload_quota_usage(_scope_type, _scope_id, _metric)`):**
- `interviews` count: rows in `audits` where the audit has a matching row in `interview_metadata` AND `mobile_zip_url IS NOT NULL` AND `file_url IS NOT NULL` (i.e. PDF + metadata both present), filtered by interviewer_code (or all interviewers belonging to the FM via `team_assignments`), AND `uploaded_at >= last_reset_at`.
- `names` count: SUM(`interview_metadata.total_names`) filtered the same way.
- `last_reset_at = reset_at - interval` derived per `reset_period`; if `reset_period = 'one_off'`, `last_reset_at = '-infinity'`.

**Server-side enforcement:** new RPC `assert_upload_allowed(_file_name)` called by every upload dialog before insert into `audits`. It:
1. Parses `interviewer_code` and `contractor_id` from filename.
2. Checks `upload_lock_settings` for `global`, `contractor=<id>`, the FM resolved from `team_assignments`, and `interviewer=<code>`. Any locked → `RAISE EXCEPTION 'Uploads are locked: <reason>'`.
3. Resolves quota for FM and interviewer; if usage + 1 (interviews) or usage + new total_names (names) would exceed limit → raise.
4. Returns `OK` with current usage so the dialog can display "X / Y used".

Client wiring:
- `UploadDialog`, `CombinedUploadDialog`, `BulkPdfUploadDialog`, `BulkMetadataUploadDialog`, `BulkZipUploadDialog`: call `assert_upload_allowed` per file; if it throws, mark file `error` with the message and continue with the rest.
- New page `/admin/upload-controls` (linked under Admin nav) with two tabs:
  - **Locks**: toggle global lock; per-contractor list (admins/super_admin); per-FM and per-interviewer search-and-toggle (contractors/sub-contractors only see their scope).
  - **Quotas**: per-FM and per-interviewer; choose metric (interviews/names), limit, reset date/time, reset_period. Shows current usage bar.

**FM dashboard surface:** add a `UploadQuotaCard` on `FieldManagerDashboard` showing "X / Y new interviews used (resets <relative time>)" or names variant. Read-only RPC `get_my_upload_quota()` returns active quota + usage.

### 4. Override Notes PDF — sort by folder name ascending

In `supabase/functions/export-team-pdfs/index.ts`, sort `overridden` by `file_name` ascending before iterating:
```text
overridden.sort((a, b) => a.file_name.localeCompare(b.file_name))
```

### Files

**New**
- `supabase/migrations/<ts>_chat_event_processor_and_upload_controls.sql` — `process_chat_event_inline` + drain trigger; `chat_user_blocks.except_user_ids`; updated `can_message_users`; `upload_lock_settings`, `upload_quota_settings`, `get_upload_quota_usage`, `assert_upload_allowed`, `get_my_upload_quota`.
- `src/components/chat/ChatToastListener.tsx`
- `src/pages/UploadControls.tsx`
- `src/components/dashboard/UploadQuotaCard.tsx`
- `src/components/chat/policies/RoleMatrixCard.tsx`
- `src/components/chat/policies/BlockedUserChip.tsx`

**Edited**
- `src/App.tsx` — mount `ChatToastListener`; route `/admin/upload-controls`.
- `src/components/Header.tsx`, `src/components/MobileNav.tsx` — Admin nav entry "Upload Controls".
- `src/pages/ChatPolicies.tsx` — autosave on toggle, role matrix card, per-user except picker.
- `src/pages/Inbox.tsx` — Tracking label tweak + subtitle.
- `src/pages/FieldManagerDashboard.tsx` — render `UploadQuotaCard`.
- `src/components/UploadDialog.tsx`, `CombinedUploadDialog.tsx`, `BulkPdfUploadDialog.tsx`, `BulkMetadataUploadDialog.tsx`, `BulkZipUploadDialog.tsx` — call `assert_upload_allowed` before insert/upload.
- `supabase/functions/export-team-pdfs/index.ts` — sort `overridden`.

### Out of scope
- GitHub sync issue (per earlier note).
