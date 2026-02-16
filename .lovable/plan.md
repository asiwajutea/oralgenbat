

## Plan: Activate Push Notifications for All Notification Types

### What This Does
Makes push notifications actually work in real-time for every notification type. When any database trigger inserts a new notification, users who have granted browser permission will immediately see a browser push notification -- even if the app tab is in the background.

### Current Gap
- Database triggers already create notification records in `user_notifications` for all 15+ event types
- The bell icon already displays them when the user opens the dropdown
- But there is **no realtime listener** watching for new notifications, so users never get a live browser push notification
- The notification settings table only has 5 toggle columns, missing toggles for the 10 new notification types

### Changes

**1. Database Migration: Enable Realtime + Add Setting Columns**

- Enable realtime on the `user_notifications` table so the frontend can subscribe to new inserts
- Add 10 new toggle columns to `user_notification_settings` for the new notification types:
  - `notify_audit_passed` (default true)
  - `notify_team_requests` (default true)
  - `notify_interview_assigned` (default true)
  - `notify_data_entry_complete` (default true)
  - `notify_account_status` (default true)
  - `notify_new_registration` (default true)
  - `notify_payment` (default true)
  - `notify_agent_reassigned` (default true)
  - `notify_issues` (default true)
  - `notify_comments` (default true)

**2. File: `src/hooks/useNotifications.ts`**

- Add a Supabase Realtime channel subscription that listens for `INSERT` events on `user_notifications` filtered to the current user's ID
- When a new notification arrives, check the user's notification settings to see if that type is enabled
- If enabled and browser permission is granted, fire a local browser `Notification` with the title and message
- Also invalidate the notifications query cache so the bell icon updates immediately
- Update the `NotificationSettings` interface to include all new toggle fields

**3. File: `src/components/NotificationSettings.tsx`**

- Add toggle switches for all 10 new notification categories grouped into sections:
  - **Audit Notifications**: Audit Passed, Failed Audits, Re-Audit Requests
  - **Team Notifications**: Team Requests, Agent Reassigned, Interview Assigned
  - **Account Notifications**: Account Status, New Registrations
  - **Other Notifications**: Payments, Data Entry Complete, Issues, Comments, Achievements, Inactivity

**4. File: `src/components/PushNotificationPrompt.tsx`**

- Update the notification list shown in the prompt dialog to include all new notification types (team requests, payments, account status, etc.)

### How It Works End-to-End

```text
DB trigger fires (e.g., audit passes)
  -> Row inserted into user_notifications
  -> Supabase Realtime broadcasts the INSERT
  -> useNotifications hook receives the event
  -> Checks user's settings (e.g., notify_audit_passed = true?)
  -> If yes + browser permission granted:
       -> Fires browser Notification("Interview Passed Audit", ...)
  -> Invalidates query cache -> bell icon count updates
```

### What Stays the Same
- All existing database triggers unchanged
- Bell icon dropdown UI unchanged
- Push notification permission flow unchanged (prompt dialog + settings page)
- PWA service worker config unchanged

### Technical Details

- The realtime subscription uses Supabase's `postgres_changes` with `filter: "user_id=eq.{userId}"` so each user only receives their own notifications
- A mapping function converts notification `type` strings to the corresponding settings column name (e.g., `audit_passed` maps to `notify_audit_passed`)
- The subscription is cleaned up on component unmount via the channel unsubscribe
- Browser notifications use the standard `Notification` API (already supported by the PWA setup)
