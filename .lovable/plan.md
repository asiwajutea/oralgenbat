# Email Notifications System

Add Gmail-powered email notifications for platform events, manageable from the existing SMS Logs page (renamed to **Notification Center**). Restricted to `admin` / `super_admin` (already enforced via `FullAdminRoute`).

Sender (already deployed in `send-gmail` function):
- From: `"BAT Audit" <Zamoph.audit@gmail.com>`
- Reply-To: `Zamoph.audit@gmail.com`

---

## 1. Database (one migration)

**`email_templates`** — editable templates, seeded with defaults
- `key` (text, unique) — e.g. `audit_passed`, `audit_failed`, `re_audit_requested`
- `name`, `description`
- `subject` (text, supports `{{var}}` placeholders)
- `body_html` (text), `body_text` (text)
- `enabled` (bool, default true)
- `available_vars` (jsonb) — list of supported `{{var}}` names for the editor UI
- `updated_by`, timestamps
- RLS: select/update only `admin`/`super_admin` via `has_role`

**`email_logs`** — mirror of `sms_logs`
- `template_key`, `recipients` (text[]), `subject`, `body_preview`, `status` (`sent`/`failed`/`skipped`), `error_message`, `provider_response` (jsonb), `audit_id`, `triggered_by_event`, `created_at`
- RLS: select for `admin`/`super_admin`; insert via service role from edge functions

**`user_email_preferences`** — per-user opt-out, parallel to push toggles
- `user_id` (PK), boolean columns matching the existing `notify_*` keys (`notify_audit_passed`, `notify_failed_audit`, `notify_re_audit`, `notify_team_requests`, `notify_account_status`, `notify_new_registration`, `notify_payment`, `notify_issues`, `notify_comments`, `notify_milestones`, `notify_data_entry_complete`, `notify_interview_assigned`, `notify_agent_reassigned`, `notify_new_interviews`, `notify_inactivity`) — all default `true`
- RLS: each user manages their own row

Default template seeds (10–12 templates covering the existing notification surface):
1. `audit_passed`
2. `audit_failed`
3. `re_audit_requested`
4. `new_interview_uploaded`
5. `team_request` (assignment / approval / rejection)
6. `agent_reassigned`
7. `interview_assigned_to_data_entry`
8. `account_approved` / `account_suspended` (one template, status var)
9. `new_registration_pending`
10. `payment_recorded`
11. `issue_flagged` / `issue_resolved`
12. `achievement_earned`
13. `inactivity_reminder`

---

## 2. Edge functions

**`send-email-notification`** (new, generic dispatcher)
- Input: `{ template_key, recipients[], variables{}, audit_id?, event? }`
- Loads template from DB, checks `enabled`
- For each recipient: looks up `user_email_preferences` to honor opt-out, looks up profile email
- Renders subject/body with `{{var}}` substitution (HTML-escaped)
- Calls existing `send-gmail` function (one call per recipient, or one with To list — per recipient so opt-out is respected)
- Inserts row into `email_logs` per recipient with status

**`send-test-email`** (new, very small)
- Input: `{ to, template_key? }`
- Renders preview values for the chosen template (or a generic test template) and sends via `send-gmail`
- Returns success/error
- Restricted: validates caller JWT and `has_role(user, 'admin'|'super_admin')`

**Hook into existing notification points** (where `notifications` rows are inserted today — found via `useNotifications` toggle keys). For each event, after the in-app notification is created, also invoke `send-email-notification` with the corresponding `template_key`. Triggering can be done from:
- Existing client-side insert points (e.g. `TeamAssignments`, `NoticeBoard`, `process-chat-events`)
- A single Postgres trigger on `notifications` table that calls the dispatcher via `pg_net` — preferred so we don't have to touch every call site.

Use the trigger approach: `AFTER INSERT ON notifications` → maps `type` → `template_key`, calls `send-email-notification` with `recipient_id = notifications.user_id`.

---

## 3. Frontend changes

**Rename route** `/admin/sms-logs` → `/admin/notification-center` (keep old path as redirect). Update `Header.tsx` and `MobileNav.tsx` link label to "Notification Center".

**`SmsLogs.tsx` → `NotificationCenter.tsx`** with three tabs:
1. **SMS Logs** — current SMS logs UI, unchanged
2. **Email Logs** — same table layout but reads from `email_logs`, with filters (template, status, date, recipient) and PDF export parity
3. **Email Templates** — list of templates with edit dialog
   - Edit: subject + WYSIWYG/textarea for HTML body + plain-text fallback
   - Sidebar shows `available_vars` chips (click to insert `{{var}}` at cursor)
   - Live preview pane rendering with sample data
   - Toggle `enabled`
   - Save persists to `email_templates`
4. **Test Send** — small panel (top of Email Logs tab or its own tab):
   - Template dropdown + recipient email input + "Send Test" button
   - Shows result toast and adds row to email logs

**`NotificationSettings.tsx`** — add a parallel "Email Notifications" section with the same toggle list, bound to `user_email_preferences`.

---

## Technical details

- Template rendering: simple `{{var}}` regex replace; HTML-escape values; allow `{{var | raw}}` for trusted ones (links). No template injection from user input.
- `send-gmail` already exists and works — dispatcher just calls `supabase.functions.invoke('send-gmail', { body: { to, subject, html, text } })`.
- PG trigger uses `pg_net.http_post` to the dispatcher with the service role key stored in `vault`.
- All emails honor `user_email_preferences` → if disabled, log row is `status = 'skipped'` (so admin still sees the attempt).
- Test send bypasses preferences (clearly labeled).
- Sender mismatch note: deployed `send-gmail` uses `Zamoph.audit@gmail.com`. User wrote `zamoph.audit@gmail.com` in this message — same address (case-insensitive). Will keep as-is.

---

## Files

New:
- `supabase/migrations/<ts>_email_notifications.sql`
- `supabase/functions/send-email-notification/index.ts`
- `supabase/functions/send-test-email/index.ts`
- `src/pages/NotificationCenter.tsx` (replaces `SmsLogs.tsx`)
- `src/components/notifications/EmailLogsTab.tsx`
- `src/components/notifications/EmailTemplatesTab.tsx`
- `src/components/notifications/EditTemplateDialog.tsx`
- `src/components/notifications/TestEmailPanel.tsx`

Edited:
- `src/App.tsx` (route rename + redirect)
- `src/components/Header.tsx`, `src/components/MobileNav.tsx` (label/path)
- `src/components/NotificationSettings.tsx` (email toggles)
