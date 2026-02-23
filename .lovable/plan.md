

## Plan: PWA Web Push Notifications, Deletion Fix, Diagnostics Pagination, and PDF Delete Button

**STATUS: COMPLETED**

All four areas have been implemented:

### 1. ✅ Fix Duplicate Deletion Error (payment_records + audit_file_cleanup_log foreign keys)
- Added `payment_records` and `audit_file_cleanup_log` cleanup in `DuplicateInterviews.tsx`

### 2. ✅ ZIP/PDF Diagnostics: Fix 1000-Row Limit
- Both `PdfDiagnosticsTab.tsx` and `ZipDiagnostics.tsx` now use `fetchAllRows` utility

### 3. ✅ Add PDF Delete Button on Review/Interview Page
- Delete button with confirmation dialog in the PDF viewer panel header
- Available to admin, super_admin, field_manager, and contractor roles
- Removes from storage and clears `file_url`

### 4. ✅ Real PWA Web Push Notifications (VAPID-Based)
- `public/sw-push.js` - Service worker for background push + notification clicks
- `supabase/functions/send-web-push/index.ts` - Edge function with VAPID signing
- `src/hooks/useNotifications.ts` - Registers push SW, subscribes with VAPID
- DB trigger `send_web_push_on_notification` fires on every `user_notifications` INSERT
- `notify_push_notification` trigger also calls edge function for bulk push
- User notification settings respected before sending push
- Expired subscriptions auto-cleaned
