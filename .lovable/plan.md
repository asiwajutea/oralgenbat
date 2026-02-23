

## Plan: PWA Web Push Notifications, Deletion Fix, Diagnostics Pagination, and PDF Delete Button

This plan addresses four areas: implementing true browser Web Push notifications via VAPID keys, fixing a new foreign key deletion error, removing the 1000-row limit on diagnostics, and adding a PDF delete button on the review page.

---

### 1. Fix Duplicate Deletion Error (payment_records foreign key)

The error shows: `"update or delete on table 'audits' violates foreign key constraint 'payment_records_audit_id_fkey' on table 'payment_records'"`.

The deletion code already cleans up `sms_notification_logs`, `audit_checklist_progress`, etc., but does NOT clean up `payment_records` before deleting the audit.

**File: `src/pages/DuplicateInterviews.tsx`**
- Add `await supabase.from('payment_records').delete().eq('audit_id', id);` before the audit delete, alongside the existing cleanup statements

**Database migration:**
- Add a DELETE RLS policy on `payment_records` for admin/super_admin roles (currently only ALL policy exists for admins, which should cover DELETE, but need to verify the existing `Admins can manage payment records` ALL policy works for delete -- it does, so no migration needed)

---

### 2. ZIP/PDF Diagnostics: Fix 1000-Row Limit

The PDF diagnostics tab fetches audits using a standard Supabase query which is capped at 1000 rows by default.

**File: `src/components/diagnostics/PdfDiagnosticsTab.tsx`**
- Replace the direct `supabase.from("audits").select(...)` call with the existing `fetchAllRows` utility from `@/utils/paginatedFetch`
- This will batch the query in 1000-row pages and return all results

**File: `src/pages/ZipDiagnostics.tsx`**
- Similarly replace the ZIP diagnostics query with `fetchAllRows` to ensure it also fetches beyond 1000 rows

---

### 3. Add PDF Delete Button on Review/Interview Page

Users want to be able to delete an uploaded PDF directly from the interview review page, similar to how metadata can be managed.

**File: `src/pages/ReviewInterview.tsx`**
- Add a delete button next to the PDF viewer section (right panel header area)
- When clicked, show a confirmation dialog
- On confirm: remove the PDF from `audit-pdfs` storage bucket, then update `audits.file_url` to empty string
- Invalidate the audit query to refresh the view
- Only show the delete button for admin/super_admin roles (or field_manager/contractor for re-audit scenarios)

---

### 4. Real PWA Web Push Notifications (VAPID-Based)

Currently the app uses browser `new Notification()` which only works when the app tab is open. True Web Push via VAPID allows notifications even when the app is closed or the browser is in the background.

#### 4a. Generate VAPID Keys and Store as Secrets

- Generate a VAPID key pair (public + private)
- Store `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` as secrets
- Expose the public key to the frontend via an environment variable or hardcode it (public keys are safe to expose)

#### 4b. Custom Service Worker for Push

**File: `public/sw-push.js`** (new)
- A lightweight custom service worker that handles `push` and `notificationclick` events
- On `push`: parse the notification payload (title, message, url) and show via `self.registration.showNotification()`
- On `notificationclick`: open or focus the app at the specified URL using `clients.openWindow()`
- This runs independently of the Vite PWA service worker

**File: `src/hooks/useNotifications.ts`**
- Update `requestPermission` to:
  1. Register `sw-push.js` as a service worker (separate scope or same)
  2. After permission granted, call `registration.pushManager.subscribe()` with the VAPID public key
  3. Save the PushSubscription JSON to `user_notification_settings.push_subscription`
- The existing realtime subscription continues to handle in-app bell notifications

#### 4c. Edge Function to Send Web Push

**File: `supabase/functions/send-web-push/index.ts`** (new)
- Accepts `{ title, message, url, user_ids }` or reads from `push_notifications` table
- Fetches `push_subscription` from `user_notification_settings` for targeted users
- Uses the `web-push` library (or raw Web Push Protocol with VAPID signing) to send push notifications
- Updates `push_notification_deliveries.delivered_at` on success
- Handles expired/invalid subscriptions by clearing them from the database

#### 4d. Update Push Notification Trigger

**Database migration:**
- Update the `notify_push_notification` trigger function to also call the `send-web-push` edge function via `net.http_post()`, similar to how `notify_failed_audit` calls `send-failed-audit-sms`
- This ensures that whenever a push notification is created via the Notice Board, the edge function fires real browser push notifications

#### 4e. Link User Profile Notification Preferences to Push

The user wants their notification settings (from User Profile) to also control what web push notifications they receive.

**File: `supabase/functions/send-web-push/index.ts`**
- Before sending a push to a user, check their `user_notification_settings` to see if the relevant notification type is enabled
- The `notify_push_notification` trigger already inserts into `user_notifications` which respects the realtime listener's settings check; the edge function will add the same check for web push delivery

#### 4f. Track Push Delivery Interactions

**File: `public/sw-push.js`**
- On `notificationclick`, make a fetch call to the app's API to update `push_notification_deliveries.interacted_at`

**File: `src/hooks/useNotifications.ts`**
- When a realtime push notification is received and the user views it (bell icon click), update `push_notification_deliveries.read_at`

---

### Technical Summary

| Area | File | Change |
|------|------|--------|
| Deletion fix | `src/pages/DuplicateInterviews.tsx` | Add `payment_records` cleanup before audit delete |
| 1000-row fix | `src/components/diagnostics/PdfDiagnosticsTab.tsx` | Use `fetchAllRows` instead of direct query |
| 1000-row fix | `src/pages/ZipDiagnostics.tsx` | Use `fetchAllRows` instead of direct query |
| PDF delete | `src/pages/ReviewInterview.tsx` | Add delete PDF button with confirmation dialog |
| Web Push | `public/sw-push.js` | New service worker for push + notificationclick |
| Web Push | `supabase/functions/send-web-push/index.ts` | New edge function to send VAPID-signed push notifications |
| Web Push | `src/hooks/useNotifications.ts` | Register push SW, subscribe with VAPID, save subscription |
| Web Push | Database migration | Update `notify_push_notification` trigger to call edge function |
| Web Push | Secrets | Add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` |

