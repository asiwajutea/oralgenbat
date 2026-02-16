

## Plan: Mobile-Optimize Field Manager Dashboard + Comprehensive Notification System

This plan covers two features:
1. Making the Field Manager Dashboard fully mobile-optimized (matching the pattern already used on the Interview Tracking page)
2. Creating a comprehensive notification system covering all key user activities across every role

---

### Part 1: Mobile-Optimize Field Manager Dashboard

**Current State:** The `/field-manager-dashboard` page uses the generic `AuditTable` component which renders a standard HTML table -- unusable on small screens. The Interview Tracking page already has a mobile accordion pattern that works well.

**What Changes:**

**File: `src/pages/FieldManagerDashboard.tsx`**

- Import `useIsMobile` hook and `Accordion` components
- Replace the `AuditTable` usage with a conditional render:
  - **Mobile (< 768px):** Show interviews as expandable accordion items, each displaying the interview ID and status badge in the header, with details (interviewer code, date, status, re-audit info, artifacts) and action buttons (View PDF, Re-Audit) revealed on expand
  - **Desktop:** Keep the existing `AuditTable` as-is
- The mobile stats bar at the top (horizontal scroll chips) is already implemented -- no changes needed there
- Add search input for mobile users to filter by interview ID
- Add a compact sort toggle (by date, status) accessible on mobile

**Mobile Accordion Item Layout:**
```text
[AccordionTrigger]
  NG71_711_20251208  |  [Passed]  [Re-Audit badge if applicable]

[AccordionContent]
  Interviewer: 711 (Name)
  Uploaded: Jan 15, 2025
  Last Modified: Feb 10, 2025
  Status: Audit Passed
  Artifacts: [PDF] [ZIP]
  
  [View PDF]  [Re-Audit]
```

---

### Part 2: Comprehensive Notification System

**Current Notifications (already implemented via database triggers):**

| Trigger | Type | Who Gets Notified |
|---------|------|-------------------|
| New interview uploaded (status = Awaiting Review) | `new_interview` | Auditors |
| Audit failed | `failed_audit` | Contractor users, Field Manager, Admins |
| Re-audit submitted | `re_audit` | Original reviewer (auditor) |
| Achievement earned | `milestone` | The user who earned it |
| User inactive 24h+ | `inactivity` | The inactive user |
| Issue flagged on assignment | `flagged_issue` | Field managers, contractors, admins |
| Issue resolved | `issue_resolved` | The clerk who flagged it |
| Comment reply on artifact | `comment_reply` | Parent comment author |
| Resolution comment | `resolution_comment` | User who marked as resolved |
| New announcement | `announcement` | Targeted users |

**Proposed New Notifications:**

| # | Trigger | Type | Who Gets Notified | How |
|---|---------|------|-------------------|-----|
| 1 | Audit Passed | `audit_passed` | Contractor users + Field Manager for that interview | DB trigger on audits UPDATE when status changes to "Audit Passed" |
| 2 | Team assignment approved | `team_request_approved` | The Field Manager who requested it | DB trigger on team_assignments UPDATE when status changes to "approved" |
| 3 | Team assignment rejected | `team_request_rejected` | The Field Manager who requested it | DB trigger on team_assignments UPDATE when status changes to "rejected" |
| 4 | New team assignment request | `new_team_request` | Contractor / Sub-Contractor who can approve | DB trigger on team_assignments INSERT when status = "pending" |
| 5 | Interview assigned to data entry team | `interview_assigned` | Data Entry Clerks on that team | DB trigger on interview_assignments INSERT |
| 6 | Data entry completed | `data_entry_complete` | Admins + QA Managers | DB trigger on interview_assignments UPDATE when entry_status changes to "data_entry_complete" |
| 7 | PDF/Metadata replaced (re-audit submission) | `artifact_replaced` | Auditors (the original reviewer) | Already partially covered by re_audit; this adds coverage for artifact-only replacements |
| 8 | User account approved | `account_approved` | The newly approved user | DB trigger on profiles UPDATE when is_approved changes to true |
| 9 | User account suspended | `account_suspended` | The suspended user | DB trigger on profiles UPDATE when account_status changes to "suspended" |
| 10 | New user registration (pending approval) | `new_registration` | Admins + Super Admins | DB trigger on profiles INSERT |
| 11 | Payment record created | `payment_created` | The contractor whose invoice was recorded | DB trigger on payment_records INSERT |
| 12 | Booklet journey status updated | `journey_updated` | The contractor who owns the payment record | DB trigger on payment_records UPDATE when journey_status changes |
| 13 | Agent reassigned to different FM | `agent_reassigned` | Both the old and new Field Manager | DB trigger on team_assignments UPDATE when field_manager_id changes |
| 14 | Bulk upload completed | `bulk_upload_complete` | The user who initiated the upload | Client-side notification after bulk upload finishes |
| 15 | SMS notification sent for failed audit | `sms_sent` | The admin/contractor who triggered it | Edge function notification after SMS dispatch |

**Implementation approach:**

**Database migrations (new triggers):**

1. **`notify_audit_passed`** - Trigger on `audits` UPDATE. When `NEW.status = 'Audit Passed'` and `OLD.status != 'Audit Passed'`, look up the interview's contractor users and field manager from metadata, insert notifications.

2. **`notify_team_assignment_status`** - Trigger on `team_assignments` UPDATE. When status changes from "pending" to "approved" or "rejected", notify the field_manager_id.

3. **`notify_new_team_request`** - Trigger on `team_assignments` INSERT when status = "pending". Notify contractors matching the contractor_id, and sub-contractors assigned to that field manager.

4. **`notify_interview_assigned`** - Trigger on `interview_assignments` INSERT. Look up the team members and notify them.

5. **`notify_data_entry_complete`** - Trigger on `interview_assignments` UPDATE when entry_status changes to "data_entry_complete". Notify admins and QA managers.

6. **`notify_account_approved`** - Trigger on `profiles` UPDATE when is_approved changes from false to true. Notify the user.

7. **`notify_account_suspended`** - Trigger on `profiles` UPDATE when account_status changes to "suspended". Notify the user.

8. **`notify_new_registration`** - Trigger on `profiles` INSERT. Notify all admin and super_admin users.

9. **`notify_payment_created`** - Trigger on `payment_records` INSERT. Notify contractor users matching the contractor_name/vendor_id.

10. **`notify_agent_reassigned`** - Trigger on `team_assignments` UPDATE when field_manager_id changes. Notify both old and new FMs.

**Frontend changes:**

**File: `src/components/NotificationBell.tsx`**
- Add icons for new notification types (UserCheck, UserX, CreditCard, ClipboardCheck, etc.)
- Add navigation handlers for new types (e.g., `team_request_approved` navigates to `/team-management`)

**File: `src/hooks/useNotifications.ts`**
- No structural changes needed; the existing hook already fetches all notification types generically

**Notification Settings (optional enhancement):**

**File: `src/components/NotificationSettings.tsx`**
- Add toggle switches for the new notification categories so users can opt in/out

**Summary of notifications by role:**

| Role | Notifications They Receive |
|------|---------------------------|
| **Super Admin** | New registrations, all failed audits, data entry complete, account changes, all team requests |
| **Admin** | New registrations (scoped), failed audits (scoped to FMs), data entry complete, team requests from assigned FMs |
| **Contractor** | Failed audits, passed audits, new team requests, payment created, journey updates, bulk upload complete |
| **Sub-Contractor** | Failed audits (scoped), passed audits (scoped), new team requests from assigned FMs |
| **Field Manager** | Failed audits (own team), passed audits (own team), team request approved/rejected, agent reassigned, issue flagged/resolved |
| **Auditor** | New interviews to review, re-audit requests, achievements, inactivity |
| **Data Entry Clerk** | Interview assigned to team, issue resolved, flagged issue response, achievements |
| **QA Manager** | Data entry complete, achievements |

---

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/pages/FieldManagerDashboard.tsx` | Modify - add mobile accordion view |
| `src/components/NotificationBell.tsx` | Modify - add icons and navigation for new types |
| Database migration (10 new trigger functions) | Create via migration tool |

### Technical Considerations

- All new triggers follow the same pattern as existing ones (INSERT into `user_notifications`)
- No new tables needed -- everything uses the existing `user_notifications` table
- The `getNotificationIcon` function in `NotificationBell.tsx` will be extended with a comprehensive switch statement
- Navigation targets for each notification type will be mapped to the appropriate page

