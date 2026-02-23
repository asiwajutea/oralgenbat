

## Plan: Fix Deletion Error, PDF Diagnostics, Push Notification Tracking, and Announcement Improvements

This plan addresses 4 areas: the duplicate deletion FK error, adding corrupt PDF detection to diagnostics, a proper push notification tracking system, and improving the announcement creation flow.

---

### 1. Fix Duplicate Interview Deletion (Foreign Key on sms_notification_logs)

The error screenshot shows: `"update or delete on table 'audits' violates foreign key constraint 'sms_notification_logs_audit_id_fkey' on table 'sms_notification_logs'"`.

The `sms_notification_logs` table has a foreign key `audit_id` referencing `audits.id`. The deletion code doesn't clean up SMS logs before deleting the audit.

**File: `src/pages/DuplicateInterviews.tsx`**
- Add `await supabase.from('sms_notification_logs').delete().eq('audit_id', id);` before deleting the audit record
- This must be added alongside the existing cleanup of `audit_checklist_progress`, `artifact_correction_comments`, etc.

**Database migration:**
- Add a DELETE RLS policy on `sms_notification_logs` for admin/super_admin roles (currently only SELECT and INSERT policies exist)

---

### 2. ZIP/PDF Diagnostics Page Expansion

Rename and expand the existing ZIP Diagnostics page to also detect corrupt PDFs.

**File: `src/pages/ZipDiagnostics.tsx`**

Add a tabbed interface: "ZIP Diagnostics" (existing) and "PDF Diagnostics" (new).

**PDF Diagnostics logic:**
- Fetch all audits that have a `file_url` (PDF uploaded)
- For each PDF, attempt a HEAD request to the storage URL to check if the file exists and is accessible
- Check the response `Content-Length` -- PDFs with 0 bytes or extremely small sizes (under 1KB) are flagged as potentially corrupt
- Also check `Content-Type` to verify it's actually a PDF
- Classify PDFs as: "healthy" (accessible, valid size), "corrupt" (exists but too small / wrong type), "missing" (404 / not found)

**PDF Diagnostics UI:**
- Stats cards: Total PDFs, Healthy, Corrupt/Suspicious, Missing
- Table showing file name, PDF URL, file size, status, upload date
- Actions: Delete corrupt PDF, Replace PDF (triggers file upload that updates `audits.file_url`)
- Filters: status, search, date range

**File: `src/components/Header.tsx` and `src/components/MobileNav.tsx`**
- Update nav link text from "ZIP Diagnostics" to "ZIP/PDF Diagnostics"

---

### 3. Push Notification Tracking System

Currently, the "Push" tab on the Notice Board just creates an announcement. The user wants:
- A separate push notification system (not converted to announcements)
- Track which users are subscribed to push
- Track delivery and interaction with push notifications

**Database migrations (new tables):**

**Table: `push_notifications`**
- `id` (uuid, PK)
- `title` (text, not null)
- `message` (text, not null)
- `created_by` (uuid, not null)
- `created_at` (timestamptz, default now())
- `target_type` (text, default 'all') -- 'all', 'roles', 'users'
- `target_roles` (text[], nullable) -- array of roles (supports multiple)
- `target_user_ids` (uuid[], nullable)
- RLS: admins/super_admins/contractors/sub_contractors can insert; approved users can view

**Table: `push_notification_deliveries`**
- `id` (uuid, PK)
- `push_notification_id` (uuid, FK to push_notifications)
- `user_id` (uuid, not null)
- `delivered_at` (timestamptz, default now())
- `read_at` (timestamptz, nullable)
- `interacted_at` (timestamptz, nullable)
- RLS: service role can insert; users can view/update their own

**View: Push subscription stats**
- Query `user_notification_settings` where `push_subscription IS NOT NULL` to count subscribed users
- Display on the Push tab

**File: `src/pages/NoticeBoard.tsx`**
- Rewrite the Push tab to:
  - Show subscription stats card (total users, subscribed count, percentage)
  - Show sent push notifications list with delivery/read/interaction stats
  - Send form uses the new `push_notifications` table (NOT announcements)
  - Each sent push shows: total targeted, delivered, read, interacted counts

**File: `src/hooks/useNotifications.ts`**
- Update the realtime subscription to also listen for `push_notifications` inserts and trigger browser notifications for matching users

---

### 4. Announcement Creation Flow Improvements

**File: `src/components/announcements/CreateAnnouncementDialog.tsx`**

**a) Multi-role targeting:**
- When `target_type === "role"`, change the single role Select to a multi-select using checkboxes
- Store selected roles as an array
- Update the database `announcements.target_role` to support this, OR use `target_user_ids` to resolve role members at creation time
- Simpler approach: add a new column `target_roles` (text array) to announcements table, update the `notify_new_announcement` trigger and the RLS SELECT policy to check against the array

**b) Specific Users targeting:**
- When `target_type === "user"`, fetch all approved users from profiles and display a searchable multi-select list
- Show user name, email, role, and contractor_id for identification
- Store selected user IDs in `target_user_ids`

**c) Multi-tab flow before creating:**
- Remove the "Create" button from the Content tab footer
- Move the "Create Announcement" button to the dialog footer, outside the tabs
- Add a "Next" button on Content tab that navigates to Targeting tab
- Add "Back" / "Next" buttons on Targeting tab
- Only show the final "Create" button on the Scheduling tab (or in the footer with validation that all tabs have been visited)
- Alternative simpler approach: keep the Create button in the dialog footer but validate all three tabs before allowing creation

**d) Push notification form multi-role:**
- Update the Push tab send form to also support multi-role selection and specific user targeting (same pattern as announcements)

---

### Technical Summary

| Area | File | Change |
|------|------|--------|
| Deletion fix | `src/pages/DuplicateInterviews.tsx` | Add `sms_notification_logs` cleanup before audit delete |
| Deletion fix | Database migration | Add DELETE policy on `sms_notification_logs` for admins |
| PDF Diagnostics | `src/pages/ZipDiagnostics.tsx` | Add "PDF Diagnostics" tab with corrupt PDF detection, delete/replace actions |
| PDF Diagnostics | `src/components/Header.tsx`, `MobileNav.tsx` | Update nav text to "ZIP/PDF Diagnostics" |
| Push tracking | Database migration | Create `push_notifications` and `push_notification_deliveries` tables |
| Push tracking | `src/pages/NoticeBoard.tsx` | Rewrite Push tab with subscription stats, delivery tracking, separate from announcements |
| Push tracking | `src/hooks/useNotifications.ts` | Add realtime listener for push_notifications |
| Announcements | Database migration | Add `target_roles` (text[]) column to announcements |
| Announcements | `src/components/announcements/CreateAnnouncementDialog.tsx` | Multi-role checkboxes, specific user searchable list, stepper flow across tabs |
| Announcements | DB trigger `notify_new_announcement` | Update to check `target_roles` array |
| Announcements | RLS on announcements | Update SELECT policy to check `target_roles` array |

