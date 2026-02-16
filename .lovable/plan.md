

## Plan: Push Notifications on Notice Board, Navigation Sub-Menus, and Persistent Permission Prompt

### 1. Add Push Notification Messaging to the Notice Board Page

**File: `src/pages/NoticeBoard.tsx`**

- Add a new tab "Push Notifications" alongside "All Announcements" and "My Announcements"
- This tab contains a simple form allowing authorized users (super_admin, contractor, sub_contractor, quality_assurance_manager) to compose and send a push notification message
- The push notification is sent by creating a targeted announcement with `frequency: 'once'` which triggers the existing `notify_new_announcement` database trigger, delivering browser push notifications to targeted users
- The tab also shows the push notification permission status with an "Enable" button for users who haven't granted permission yet

### 2. Navigation Sub-Menus (Desktop + Mobile)

**File: `src/components/Header.tsx`**

- Create a new "Communications" NavigationMenu dropdown containing:
  - Notice Board (`/notices`)
  - Push Notifications (`/notices?tab=push`) -- links directly to the push tab
- Move "Fraud Analytics" under a new "Analytics" NavigationMenu dropdown for admin/super_admin:
  - Analytics (`/analytics` or `/my-analytics` depending on role)
  - Fraud Analytics (`/fraud-analytics`)
- For non-admin roles that have both My Analytics and Fraud Analytics, group them similarly under an "Analytics" dropdown
- Remove the standalone "Fraud Analytics" NavLink

**File: `src/components/MobileNav.tsx`**

- Add a "Communications" section header with:
  - Notice Board
  - Push Notifications (links to `/notices?tab=push`)
- Move "Fraud Analytics" under an "Analytics" section header alongside existing analytics links

### 3. Persistent Push Notification Prompt for Users Without Permission

**File: `src/components/PushNotificationPrompt.tsx`**

- Change the condition: remove the check for `Notification.permission !== "default"` when permission is "default" (not yet decided)
- Remove the `localStorage` dismissed check for users whose permission is still "default" -- show the prompt on every visit using `sessionStorage` instead
- Users who click "Don't Ask Again" will still have it permanently dismissed via `localStorage`
- Users who click "Not Now" will only dismiss for the current session (use `sessionStorage`)
- If permission is already "granted" or "denied", don't show the prompt

### 4. Re-Enable Push Notifications from Profile Page

**File: `src/components/NotificationSettings.tsx`**

- When permission is "denied", add helpful text explaining how to re-enable in browser settings (since we can't programmatically override a browser denial)
- When permission is "default", show an "Enable Push Notifications" button that calls `requestPermission()`
- Add a "Reset Prompt" button that clears the `push_notification_prompt_dismissed` localStorage key, so the user will see the prompt again on next visit

### Technical Summary

| File | Change |
|------|--------|
| `src/pages/NoticeBoard.tsx` | Add "Push Notifications" tab with send form |
| `src/components/Header.tsx` | Add "Communications" dropdown (Notice Board + Push Notifications), move Fraud Analytics under "Analytics" dropdown |
| `src/components/MobileNav.tsx` | Add Communications section, move Fraud Analytics under Analytics section |
| `src/components/PushNotificationPrompt.tsx` | Show prompt every session for users with "default" permission; "Not Now" uses sessionStorage, "Don't Ask Again" uses localStorage |
| `src/components/NotificationSettings.tsx` | Add "Reset Prompt" button and browser instructions for denied state |

