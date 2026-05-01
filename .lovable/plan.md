## Two fixes: Reassign FM (FM role) + Activity History page

---

### Part 1: Fix "Reassign FM" for Field Managers

**Root cause** (verified against DB):
The `ReassignFMDialog` populates the "New Field Manager" dropdown by querying `user_roles` (filter `role=field_manager`) and then `profiles` (by those user_ids). RLS on both tables only allows:
- `user_roles`: own row, or admin/super_admin
- `profiles`: own row, sub-contractor's assigned FMs, or admin/super_admin

A Field Manager (`eniseng@gmail.com`) is none of those, so **both queries return empty**, the Select shows no options, and the "Reassign" button stays disabled. That matches the screenshot (empty dropdown, disabled button).

**Fix:** Add a `SECURITY DEFINER` RPC `get_canonical_field_managers()` that returns `{ id, full_name }` for every approved user with the `field_manager` role. Restrict execution to authenticated users (RLS-bypass is intentional and safe — it only exposes FM names, which are already visible across the app via `interview_metadata.field_manager`, team rosters, etc.).

Then update `ReassignFMDialog.tsx` to call the RPC instead of the two raw selects. No UI changes needed.

Also tighten `interview_fm_overrides` UPDATE policy to add a matching `WITH CHECK` (currently missing) so upserts that hit the conflict path stay allowed for FMs.

---

### Part 2: Activity History page (per-user, role-aware filters)

**Goal:** A page where each user can review every meaningful action they performed on the platform, with advanced filters tailored to their role. Admins/super-admins can additionally browse anyone's activity.

**Approach:** Introduce a single append-only `user_activity_log` table and write to it from key code paths (and a few DB triggers for events that already exist as triggers). Build a `/activity` page that lists the current user's activity, plus `/activity/:userId` for admins.

#### New table: `user_activity_log`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | actor (FK profiles.id) |
| user_role | app_role | snapshot of actor's role at event time |
| action_type | text | enum-like (see below) |
| entity_type | text | `audit`, `interview_metadata`, `team_assignment`, `payment`, `burn_queue`, `announcement`, `user`, `auth`, `fm_override`, `re_audit_submission`, `comment`, etc. |
| entity_id | uuid | nullable |
| entity_label | text | human label (file_name, folder_name, target user name…) |
| description | text | short sentence ("Reassigned NG71_711_… to Jane Doe") |
| metadata | jsonb | structured payload (before/after, ids, override reason…) |
| ip_address | text | optional, captured client-side header where available |
| created_at | timestamptz default now() | indexed desc |

Indexes: `(user_id, created_at desc)`, `(action_type)`, `(entity_type, entity_id)`, `(created_at desc)`.

**RLS:**
- SELECT: own rows, or admin/super_admin.
- INSERT: any approved user for `user_id = auth.uid()` (client-side logging) + `SECURITY DEFINER` triggers (server-side).
- No UPDATE/DELETE (append-only). Admin-only purge via separate function if ever needed.

#### Action types (initial set)

Auth: `login`, `logout`, `password_reset`
Audits: `audit_review_started`, `audit_passed`, `audit_failed`, `audit_pass_with_override`, `audit_sent_to_burn`, `audit_restored_from_burn`, `re_audit_requested`, `re_audit_submitted`, `interview_locked`, `interview_unlocked`
Uploads: `pdf_uploaded`, `metadata_uploaded`, `zip_uploaded`, `bulk_upload`, `interview_deleted`
Tracking: `fm_reassigned`, `issue_flagged`, `issue_resolved`, `comment_added`, `artifact_correction_resolved`
Team / users: `team_request_created`, `team_request_approved`, `team_request_rejected`, `user_approved`, `user_suspended`, `user_role_changed`
Payments: `payment_created`, `invoice_uploaded`, `budget_target_set`
Announcements & push: `announcement_created`, `push_sent`
Settings: `notification_settings_updated`, `ai_settings_updated`

#### Logging helper

`src/lib/activityLog.ts` exporting `logActivity({ action_type, entity_type, entity_id?, entity_label?, description?, metadata? })` — wraps the insert with the current user/role from `AuthContext`. Fire-and-forget, swallow errors so it never breaks user flows.

Wire calls into the highest-value places first (in priority order):
1. `AuthContext.signOut`, `Auth.tsx` (login)
2. `ReviewActions.tsx` (pass / fail / override)
3. `BurnQueue.tsx` (send / restore)
4. `FailedInterviewModal.tsx` (re-audit request)
5. `ReassignFMDialog.tsx` (FM reassignment)
6. `BulkZipUploadDialog`, `BulkPdfUploadDialog`, `BulkMetadataUploadDialog`, `UploadDialog`, `CombinedUploadDialog`
7. `TeamApprovals.tsx`, `TeamAssignments.tsx`
8. `PaymentTracking.tsx`, invoice dialogs
9. `CreateAnnouncementDialog`, push notification creator
10. Admin actions: approve user, suspend, change role

For server-only events that already have triggers (`notify_*`), add a parallel trigger that inserts an activity row, so SMS-driven status changes and bulk DB updates still appear in the log.

#### UI: `/activity` page

Route accessible to all approved users. Layout:

- **Header**: User selector (only enabled for admin/super_admin — defaults to self for everyone else).
- **Summary cards**: Total actions, actions today, last login, most-used action.
- **Advanced filter sidebar (role-aware — only show filters relevant to the viewed user's role):**

```text
Common
  Date range, Action type (multi), Search description
Auditor
  Status outcome (Pass / Fail / Override), Re-audit only
Field Manager
  Interviewer code, FM reassignments only, Team request actions
Sub-Contractor
  Assigned FM, Team approvals
Contractor
  Contractor ID scope, Upload type, Payment actions
Data-entry / QA
  Entry status, Flagged/resolved
Admin / Super-admin
  Target user, IP, All action types, Bulk actions, User management actions
```

- **Timeline table**: time, action badge, entity link (clickable: navigates to `/review/:id`, `/tracking?file=…`, etc.), description, metadata expander.
- **Export**: CSV + PDF for the current filter (admins only get the multi-user export).
- **Pagination**: server-side, 50/page, uses an RPC `get_user_activity(_user_id, filters…, limit, offset)` that returns rows + total_count to bypass the 1k row cap (per project rule).

Sidebar nav entry "Activity" added in `MobileNav.tsx` and `Header.tsx` (visible to everyone). Admins also get an "All Activity" entry that opens `/activity` with the user-selector unlocked.

#### Out of scope (this round)
- Backfilling historical activity (log starts from migration date).
- Tracking pure read events (page views) — only mutations / explicit user actions are logged.
- Real-time stream / websocket — page polls or refetches on filter change.

---

### Files to create / change

**Migrations**
- Add `get_canonical_field_managers()` RPC + grant.
- Add `WITH CHECK` to `interview_fm_overrides` UPDATE policy.
- Create `user_activity_log` table + indexes + RLS.
- Add `get_user_activity(...)` RPC.
- Add triggers that mirror existing `notify_*` events into `user_activity_log` (audit pass/fail, re-audit, team request status, user approved/suspended, payment created, announcement created).

**New code**
- `src/lib/activityLog.ts` — client logger.
- `src/pages/UserActivity.tsx` — page.
- `src/components/activity/ActivityFilters.tsx` — role-aware filter panel.
- `src/components/activity/ActivityTimeline.tsx` — list/table.
- `src/components/activity/ActivityExport.tsx` — CSV/PDF export.
- Route entry in `src/App.tsx`; nav links in `Header.tsx` / `MobileNav.tsx`.

**Edits**
- `src/components/tracking/ReassignFMDialog.tsx` — call new RPC; log activity.
- `src/contexts/AuthContext.tsx` — log login/logout.
- `src/components/review/ReviewActions.tsx`, `src/pages/BurnQueue.tsx`, `src/components/tracking/FailedInterviewModal.tsx`, upload dialogs, team approvals, payments, announcements — log activity at success points.
- `src/integrations/supabase/types.ts` — auto-regenerated.
