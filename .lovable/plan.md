# Upload Center, Lock-Aware Buttons & Penalty Charges

Three connected workstreams. Existing upload dialogs stay in place; new surfaces are additive.

---

## 1. Upload Center — `/upload-center`

A single, friendly page that walks managers through both **New Interview** and **Re-audit** uploads, plus an **Upload History** tab so they can confirm what actually went through (even silent failures).

### Layout

```text
┌──────────────────────────────────────────────────────┐
│  Upload Center                                       │
│  [ Upload ]  [ History ]                             │
├──────────────────────────────────────────────────────┤
│  What are you uploading?                             │
│   ( ) New interview                                  │
│   ( ) Re-audit (replace failed files)                │
│                                                      │
│  What files do you have? (multi-select)              │
│   [x] PDF      [x] Metadata ZIP                      │
│                                                      │
│  ── Lock banner (if locked for this scope) ──        │
│   "Uploads are locked: <reason>"   [ buttons disabled ] │
│                                                      │
│  Drop zone (PDF, ZIP, or both)                       │
│  Per-file rows: name • detected type • status pill   │
│  [ Start upload ]                                    │
└──────────────────────────────────────────────────────┘
```

- **Mode toggle** — "New interview" vs "Re-audit" decides whether the file goes through the standard insert path or the existing re-audit replacement path (same RPCs already used by `BulkPdfUploadDialog` / `BulkZipUploadDialog`).
- **Smart routing** — file extension + mode decides target storage bucket and write path. No new edge functions; we reuse the same client logic the existing dialogs use, extracted into a small `uploadInterviewFile()` helper.
- **Filename validation** — same `isValidInterviewName` check.
- **Pre-flight** — calls `assert_upload_allowed` per file. Failures show inline next to the file row instead of a toast that scrolls away.

### Upload History tab

Backed by a new `upload_attempts` table that we write to from the upload helper (success **and** failure). Columns shown:

```text
When • File • Type (PDF/ZIP) • Mode (New/Re-audit) • Status (Success/Failed/Skipped duplicate) • Reason
```

Filters: mode, status, date range. Per-row "Retry" for failed entries (re-opens the dialog with the same file pre-selected).

### Schema

```text
upload_attempts
  id uuid pk
  user_id uuid
  file_name text
  detected_kind text       -- 'pdf' | 'metadata_zip'
  mode text                -- 'new' | 're_audit'
  status text              -- 'success' | 'failed' | 'duplicate' | 'locked' | 'quota_blocked'
  message text             -- error or info
  audit_id uuid null
  created_at timestamptz
```
RLS: users see own rows; admin/super_admin see all.

### Files

- New: `src/pages/UploadCenter.tsx`, `src/components/upload-center/UploadCenterDropzone.tsx`, `src/components/upload-center/UploadHistoryTable.tsx`, `src/lib/uploadInterviewFile.ts` (shared helper, also imported by existing dialogs so history captures them too).
- Edited: `src/App.tsx` (route), `src/components/Header.tsx` + `src/components/MobileNav.tsx` (nav entry "Upload Center").
- Migration: create `upload_attempts` + RLS.

---

## 2. Lock-aware upload buttons everywhere

Today the lock is enforced server-side via `assert_upload_allowed`, but UI buttons stay enabled and only fail at submit time. Fix:

- New hook `useUploadLockStatus({ contractorId?, fieldManagerId?, interviewerCode? })` that:
  1. Reads `upload_lock_settings` for `global` + the resolved scopes.
  2. Returns `{ locked: boolean, reason: string | null, scope: 'global' | 'contractor' | ... }`.
  3. Subscribes to realtime changes on `upload_lock_settings` so unlocking re-enables buttons immediately.
- Wrap each existing upload trigger in `<UploadLockGuard>`:
  - If locked: render the button as `disabled`, with a tooltip showing the lock reason, and an inline amber chip "Uploads locked: <reason>".
  - If unlocked: render children normally.
- Apply to: home dashboards (Admin, Contractor, SubContractor, FieldManager), `InterviewTracking` page, `Index` page, the new Upload Center, and all four bulk dialogs' trigger buttons.

For users without a single resolvable scope (admins viewing the global page), only `global` lock disables the button; per-scope locks instead show a banner inside the dialog after the user picks a file.

### Files

- New: `src/hooks/useUploadLockStatus.ts`, `src/components/upload/UploadLockGuard.tsx`.
- Edited: every page that renders an "Upload" CTA (Header, Index, InterviewTracking, all four home dashboards, UploadCenter).

---

## 3. Penalty charges for failed first audits

A self-contained module. Settings are scoped: an admin/super_admin sets policy for everyone; a contractor for their sub-contractors and FMs; a sub-contractor for their FMs. Exemptions are explicit per-user.

### Schema

```text
penalty_settings                         -- one active row per (set_by_role, scope_id, target_role)
  id uuid
  set_by uuid                            -- who configured
  set_by_role app_role                   -- admin / contractor / sub_contractor
  scope_type text                        -- 'global' | 'contractor' | 'sub_contractor'
  scope_id text null                     -- contractor_id or sub_contractor user_id
  target_role app_role                   -- 'sub_contractor' | 'field_manager'
  charge_mode text                       -- 'per_name' | 'per_interview'
  amount numeric                         -- N20 or N500
  currency text                          -- 'NGN','USD',...
  effective_from date                    -- editable, defaults 2026-04-21
  is_active boolean
  updated_at, updated_by

penalty_exemptions
  id uuid
  setting_id uuid -> penalty_settings
  exempt_user_id uuid                    -- user excluded
  cascade_to_subordinates boolean        -- e.g. exempt a sub-contractor AND all their FMs
  created_at, created_by

penalty_charges                          -- one row per chargeable failed first-audit
  id uuid
  audit_id uuid
  charged_user_id uuid                   -- the FM or sub-contractor being charged
  charged_user_role app_role
  setting_id uuid                        -- which policy created it
  amount numeric
  currency text
  status text                            -- 'open' | 'paid' | 'partial' | 'waived' | 'removed' | 'appealed'
  removed_by uuid null, removed_reason text null
  appeal_reason text null, appeal_status text null  -- 'pending'|'accepted'|'rejected'
  appeal_decided_by uuid null
  created_at

penalty_payments
  id uuid
  charge_id uuid -> penalty_charges      -- nullable (general payment) or specific
  charged_user_id uuid
  amount numeric
  declared_by uuid                       -- self-declared payment
  declared_at timestamptz
  confirmed_by uuid null                 -- superior who confirmed
  confirmed_at timestamptz null
  status text                            -- 'pending_confirmation' | 'confirmed' | 'rejected'
  note text
```

### Trigger logic (Postgres)

When `audits.status` transitions to `Failed` AND `re_audit_count = 0` AND `uploaded_at >= effective_from of an applicable policy`:

1. Resolve the chargeable user(s) from `interview_metadata` + `team_assignments`:
   - FM via `team_assignments.field_manager_id`
   - Sub-contractor via the FM's parent (`field_manager_subcontractor_assignments`)
2. For each `(target_role, charged_user)` look up the strongest applicable `penalty_settings` and check exemptions (including cascade).
3. Insert one `penalty_charges` row per (audit, charged_user) — use a unique partial index `(audit_id, charged_user_id) WHERE status <> 'removed'` so the same audit cannot be charged twice. Re-audits never re-trigger.
4. Amount = `per_interview` or `per_name * interview_metadata.total_names`.

### RPCs

- `set_penalty_setting(...)` — upsert, validates the caller is allowed to configure that target_role under that scope.
- `add_penalty_exemption(setting_id, user_id, cascade)` / `remove_penalty_exemption(...)`.
- `update_effective_from(setting_id, new_date)` — only the role tier that owns the setting can edit; date defaults to **2026-04-21**.
- `remove_penalty_charge(charge_id, reason)` — superior only.
- `appeal_penalty_charge(charge_id, reason)` — charged user only.
- `decide_appeal(charge_id, accept boolean, note)` — superior; if accepted, charge becomes `waived` and is excluded from balance.
- `declare_penalty_payment(charge_id|null, amount, note)` — charged user; creates `pending_confirmation` payment and notifies superior.
- `confirm_penalty_payment(payment_id, accept boolean, note)` — superior; on accept, deduct from balance, mark charges paid in FIFO order, mark partial when needed.
- `get_penalty_summary(_user_id uuid)` — returns `{ total_charged, total_paid, balance, currency, breakdown[] }` for the homepage card.

### UI

- New page `/admin/penalties` (visible to admin / super_admin / contractor / sub_contractor):
  - **Settings tab** — table of policies the user can manage; create/edit dialog with charge mode, amount, currency, effective_from picker.
  - **Exemptions tab** — per-policy list with add-by-search and a "cascade to subordinates" toggle.
  - **Charges tab** — every charge in scope, filterable by user/status; row actions: Remove (superior), Confirm payment (superior).
  - **Payments tab** — declared payments awaiting confirmation, plus full lifetime history.
- New page `/my-penalties` (FM / sub-contractor):
  - Summary cards (Total charged, Total paid, Balance).
  - Charges table with **Appeal** and **Declare payment** actions.
  - Payment history.
- Homepage card `PenaltyBalanceCard` rendered on `FieldManagerDashboard` and `SubContractorDashboard` — pulls `get_penalty_summary(auth.uid())` and shows balance with a deep link to `/my-penalties`.
- Notifications via existing `chat_pending_events` / inbox: `penalty_charged`, `penalty_payment_declared`, `penalty_payment_confirmed`, `appeal_decided`.

### Files

- Migration: tables, indexes, trigger, RPCs, RLS.
- New pages: `src/pages/PenaltyAdmin.tsx`, `src/pages/MyPenalties.tsx`.
- New components: `src/components/penalty/PenaltySettingsTable.tsx`, `PenaltyChargesTable.tsx`, `PenaltyPaymentsTable.tsx`, `PenaltyBalanceCard.tsx`, `DeclarePaymentDialog.tsx`, `AppealChargeDialog.tsx`, `EditPenaltySettingDialog.tsx`.
- Edited: `App.tsx` (routes), `Header.tsx`/`MobileNav.tsx` (nav), `FieldManagerDashboard.tsx` and `SubContractorDashboard.tsx` (mount card), `Inbox.tsx` (handle new event types in the same drain trigger).

---

## Out of scope
- Removing existing upload buttons (you asked to keep them).
- Currency conversion — each policy stores its own currency string and is displayed as-is.
- Automatic deduction from invoices — payments are tracked separately and only marked when superior confirms.
