## Plan: Login Welcome Modal + "Send to Burn" Feature

### Feature 1: Login Welcome Modal for FM/Contractor/Sub-Contractor

**New file: `src/components/LoginWelcomeModal.tsx**`

A modal that shows on login for `field_manager`, `contractor`, and `sub_contractor` roles. It will:

- Fetch the user's scoped audits that are NOT "Audit Passed" and group them by status category (Audit Failed, No metadata, Re-Audit)
- Display a greeting with the user's first name
- Show total count of non-passed interviews
- Show a breakdown table by status category with counts
- Include an "Acknowledged" button to dismiss
- Use `sessionStorage` to only show once per session (key: `login_welcome_shown`)

**Modified file: `src/pages/Home.tsx**`

- Import and render `LoginWelcomeModal` for the relevant roles

Data scoping will follow existing patterns:

- **Field Manager**: filter audits by team codes from `team_assignments`
- **Contractor**: filter by `contractor_id` via `interview_metadata`
- **Sub-Contractor**: filter by assigned field managers' team codes

---

### Feature 2: "Send to Burn" System

#### Database changes (migration):

1. **New table: `burn_queue**`
  - `id` (uuid, PK)
  - `audit_id` (uuid, NOT NULL, references nothing explicitly but maps to audits)
  - `file_name` (text, NOT NULL)
  - `sent_by` (uuid, NOT NULL)
  - `reason` (text, NOT NULL)
  - `sent_at` (timestamptz, default now())
  - `restored_at` (timestamptz, nullable)
  - `restored_by` (uuid, nullable)
  - RLS: approved users can SELECT; admin/super_admin/contractor/sub_contractor/field_manager can INSERT; admin/super_admin can UPDATE (for restore); admin/super_admin can DELETE
2. **Scheduled cleanup**: A pg_cron job that deletes audits (with full cascade) that have been in the burn queue for 190+ days and are not restored.

#### New files:

`**src/components/SendToBurnDialog.tsx**`

- Dialog with a textarea for the reason (required)
- Accepts `auditId`, `fileName`, `onSuccess` props
- Inserts into `burn_queue` table on submit

`**src/pages/BurnQueue.tsx**`

- Full page showing all "Ready to Burn" interviews
- Table columns: File Name, Status (at time of burn), Sent By (resolved name), Reason, Sent At, Days Remaining (190 - days since sent), Actions
- "Restore" button per row (updates `restored_at` and `restored_by`)
- Pagination using `AuditPagination`
- Filter by restored/active status

#### Modified files:

`**src/pages/InterviewTracking.tsx**`

- Add a "Send to Burn" action button/icon on each row where status is NOT "Audit Passed"
- Opens `SendToBurnDialog`

`**src/pages/AdminReviewHistory.tsx**`

- Add a "Send to Burn" action button on each row where status is NOT "Audit Passed"
- Opens `SendToBurnDialog`

`**src/App.tsx**`

- Add route `/burn-queue` wrapped in `TrackingRoute` + `Layout`

`**src/components/Header.tsx**`

- Add "Burn Queue" link under the Operations dropdown menu

#### Auto-deletion edge function:

`**supabase/functions/cleanup-burn-queue/index.ts**`

- Queries `burn_queue` for items where `sent_at < now() - 190 days` and `restored_at IS NULL`
- For each, performs the full cascade delete (same pattern as existing interview deletion) and removes from `burn_queue`
- Scheduled via pg_cron to run daily  
  
Please Note: any interview sent to burn should be removed from the interviews on the interviews page, tracking page, admin review, and should not be part of the interview counts until it is restored. When it is send to burn it should act as if the interview had been temporarily deleted, so when report are generated, such interviews would not appear on the report.

---

### Technical Summary


| Area            | Files                                                                              | Change                                                            |
| --------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Welcome Modal   | New `LoginWelcomeModal.tsx`, edit `Home.tsx`                                       | Role-scoped modal showing non-passed interview counts by category |
| Burn Queue DB   | Migration                                                                          | New `burn_queue` table with RLS                                   |
| Send to Burn UI | New `SendToBurnDialog.tsx`, edit `InterviewTracking.tsx`, `AdminReviewHistory.tsx` | "Send to Burn" button with reason dialog                          |
| Burn Queue Page | New `BurnQueue.tsx`, edit `App.tsx`, `Header.tsx`                                  | Full page with restore capability and pagination                  |
| Auto-cleanup    | New edge function + pg_cron                                                        | Delete burned interviews after 190 days                           |
