

## Plan: Team Assignments 1000-Row Fix, Push Dashboard Upgrade, Permission Reset, and Announcement Stepper

This plan addresses four issues: the team assignments page showing only 1000 interviews, upgrading the Push Notifications tab to a proper dashboard, adding a push permission reset to the user profile, and converting the announcement dialog footer to a stepper pattern.

---

### 1. Team Assignments: Fix 1000-Row Limit on Assignments

The `useAssignments` hook in `src/hooks/useTeamAssignments.ts` (line 166) uses a standard `.select()` without pagination, which caps results at 1000 rows. The screenshot confirms "Assigned (1000)" when the actual count is higher (435 + 180 + 385 = 1000 is suspiciously exact).

**File: `src/hooks/useTeamAssignments.ts`**
- In `useAssignments()` (lines 162-199): replace the direct `supabase.from("interview_assignments").select(...)` with `fetchAllRows` from `@/utils/paginatedFetch`
- The join on `data_entry_teams` can be passed as the `select` parameter
- The batched audit lookup already handles large sets via `batchedInQuery`, so only the initial assignments fetch needs fixing

---

### 2. Push Notifications Tab: OneSignal-Style Dashboard

Upgrade the Push Notifications tab on the Notice Board to look like a proper web push dashboard with better stats and visual indicators.

**File: `src/pages/NoticeBoard.tsx`**

**Stats cards upgrade (replace current 3 cards):**
- Total Users (existing)
- Subscribed (existing) -- add a progress bar showing subscription rate visually
- Total Sent -- count of all push_notifications sent
- Total Delivered / Read / Interacted -- aggregate from push_notification_deliveries

**Add a "Subscribers" section:**
- Show a list/table of subscribed users with their name, email, subscription date
- Query `user_notification_settings` where `push_subscription IS NOT NULL`, join with `profiles`

**Notification history improvements:**
- Add delivery rate percentage (delivered/targeted)
- Add read rate percentage (read/delivered)
- Add click rate percentage (interacted/delivered)
- Color-code the stats (green for high rates, red for low)

**Your Status card improvements:**
- Show when the user subscribed
- Show a "Test Notification" button that sends a test push to the current user only

---

### 3. Reset Push Permission from User Profile

**File: `src/components/NotificationSettings.tsx`**

Add a "Reset Push Subscription" button that:
- Unregisters the push service worker (`sw-push.js`)
- Clears the `push_subscription` from `user_notification_settings` in the database
- Resets the local prompt dismissal state (`localStorage` keys)
- Shows instructions for re-enabling if browser permission is "denied"

This goes beyond the existing "Reset Prompt" button by also clearing the server-side subscription, effectively allowing a full re-enrollment.

**Changes:**
- Add a "Reset Push Subscription" button (visible when permission is "granted")
- On click: call `navigator.serviceWorker.getRegistrations()`, unregister the push SW, then update settings to set `push_subscription` to null
- Toast success and reload permission status

---

### 4. Announcement Dialog: Convert to Stepper Pattern

**File: `src/components/announcements/CreateAnnouncementDialog.tsx`**

Current state: Has "Next" buttons inside each tab, plus "Cancel" and "Create Announcement" buttons in the `DialogFooter`.

Required changes:
- Remove the "Next" and "Back" buttons from inside each tab content (lines 268-272, 356-363, 399-403)
- Remove the "Cancel" button from the DialogFooter
- Replace the DialogFooter with a stepper navigation:
  - On Content tab: show "Next" button only
  - On Targeting tab: show "Back" and "Next" buttons
  - On Scheduling tab: show "Back" and "Create Announcement" (or "Update") button
- The tab bar at the top remains for visual progress indication but clicking tabs directly is still allowed
- Add step indicators (1/3, 2/3, 3/3) or use the existing tab highlights as the stepper visual

---

### Technical Summary

| Area | File | Change |
|------|------|--------|
| 1000-row fix | `src/hooks/useTeamAssignments.ts` | Use `fetchAllRows` in `useAssignments()` |
| Push dashboard | `src/pages/NoticeBoard.tsx` | Add subscriber list, aggregate stats, delivery/read/click rates, test notification button |
| Permission reset | `src/components/NotificationSettings.tsx` | Add "Reset Push Subscription" button that unregisters SW and clears DB subscription |
| Announcement stepper | `src/components/announcements/CreateAnnouncementDialog.tsx` | Remove in-tab nav buttons, move stepper to footer, show Create only on last step |

