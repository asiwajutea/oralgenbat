

## Plan: Fix Errors and Implement Comment Workflow Changes

This plan addresses 5 error fixes and 1 major feature change.

---

### 1. Restrict Interview Deletion to Admin/Super Admin Only

**Problem:** Any approved user can delete interviews via the AuditTable component.

**Changes:**
- `src/components/AuditTable.tsx`: Add role check around the delete button (lines 643-653) and the `handleDelete` function. Only show the delete button and allow deletion when `userRole === 'admin' || userRole === 'super_admin'`.
- The `useAuth()` hook is already imported in this component, so we just need to check `userRole`.

---

### 2. Fix Payment Stats on Interview Tracking Page

**Problem:** The "Paid" and "Assigned, Not Paid" stat cards on the Interview Tracking page show placeholder text ("See Payment page" / em-dash) instead of actual numbers.

**Changes:**
- `src/pages/InterviewTracking.tsx` (lines 880-905): Add a query to fetch payment_records and count:
  - Interviews with a payment record (paid count)
  - Interviews assigned to a team but without a payment record (assigned not paid)
- Replace the placeholder "---" and "See Payment page" text with actual computed values.

---

### 3. Fix "Can't Load Audit" for Ready for Review Interviews

**Problem:** When super admin clicks on "Ready for Review" interviews, they see "Audit Not Found". The metadata query at line 154 uses `.single()` which throws an error when no metadata exists, causing React Query to mark it as failed.

**Changes:**
- `src/pages/ReviewInterview.tsx` (line 154): Change `.single()` to `.maybeSingle()` so that when no metadata row exists, it returns `null` instead of throwing an error.

---

### 4. Fix Auditors Cannot View NG71 Interviews

**Problem:** Auditors are filtered by `effectiveContractorId` through `interview_metadata`. If an auditor's `contractor_id` or `active_contractor_id` doesn't match NG71, they won't see those interviews. Also, interviews without metadata are invisible to auditors because the Index page filters through `interview_metadata`.

**Root Cause:** In `src/pages/Index.tsx` (line 79-81), for auditors, `effectiveContractorId` uses `active_contractor_id || contractor_id`. If the auditor's profile has a different contractor_id than NG71, they won't see NG71 interviews.

**Changes:**
- `src/pages/Index.tsx`: When filtering for auditors, also include audits without metadata (by file_name prefix matching the contractor ID). Currently, audits without metadata are excluded because the filter goes through `interview_metadata` table.
  - Add a secondary query for audits matching the contractor prefix in `file_name` but lacking metadata.
  - Combine both sets of audit IDs.

---

### 5. Refactor "Mark Resolved" to "Comment" Workflow

**Problem:** The current workflow has "Mark Resolved" as the primary button. The user wants:
1. Button renamed from "Mark Resolved" to "Comment"
2. Anyone can start commenting without resolving
3. "Mark Resolved" button moved INSIDE the comment box
4. Once resolved, comments are disabled and button shows "Resolved"
5. A "Re-open Issue" button to revert resolved status

**Changes across multiple files:**

#### a. `src/components/tracking/ResolvedCommentsModal.tsx` (Major Refactor)
- Accept new props: `isResolved` (boolean), `onMarkResolved` callback, `onReopenIssue` callback
- When NOT resolved:
  - Show comment input normally (anyone can comment)
  - Add a "Mark Resolved" button inside the comment input area
- When resolved:
  - Show the green "Marked as Resolved" banner
  - Disable comment input
  - Show "Re-open Issue" button
- Remove the separate `MarkResolvedDialog` dependency - integrate marking resolved directly into this modal

#### b. `src/components/tracking/MarkResolvedDialog.tsx`
- This component becomes less important since "Mark Resolved" moves inside the comments modal. Keep it but it will be used less.

#### c. `src/pages/InterviewTracking.tsx` (lines 1132-1160, 1334-1361)
- Rename button labels:
  - "Mark Resolved" becomes "Comment" (with MessageCircle icon)
  - "Resolved" stays as "Resolved" (when already resolved)
- Both buttons now open the `ResolvedCommentsModal` directly
- Remove `MarkResolvedDialog` usage - the modal handles both commenting and resolving
- Pass resolution/reopen callbacks to the modal
- The unread counter logic stays the same but applies to ALL interviews (not just resolved ones)
- Update the `resolvedAuditIds` query to also fetch comment counts for non-resolved interviews

#### d. `src/pages/ReviewInterview.tsx` (lines 554-580)
- Same rename: "Mark as Resolved" becomes "Comment", opens ResolvedCommentsModal
- "View Resolution Comments" becomes "Resolved"
- Pass resolution/reopen callbacks

#### e. `src/pages/AdminReviewHistory.tsx`
- Same rename pattern for any Mark Resolved / Resolved buttons in the admin table

#### f. Unread Count Query Update
- In `InterviewTracking.tsx`: Expand the unread comment count query to cover ALL interviews that have comments (not just resolved ones), since commenting is now allowed before resolution.

---

### 6. Fix Scrolling in ResolvedCommentsModal (Still Broken)

**Problem:** The `overflow-y-auto max-h-[300px]` on the comments div is still not scrolling properly.

**Changes:**
- `src/components/tracking/ResolvedCommentsModal.tsx`: Ensure the parent `DialogContent` has proper flex layout. The comment area div needs both a fixed/max height AND `overflow-y-auto`. Also ensure the auto-scroll ref targets the correct element.

---

### Technical Summary

| File | Changes |
|------|---------|
| `src/components/AuditTable.tsx` | Role-gate the delete button to admin/super_admin only |
| `src/pages/InterviewTracking.tsx` | Fix payment stats (query payment_records), rename "Mark Resolved" to "Comment", update unread count query for all interviews |
| `src/pages/ReviewInterview.tsx` | Change `.single()` to `.maybeSingle()` for metadata query, rename buttons, pass callbacks to modal |
| `src/pages/Index.tsx` | Include audits without metadata for auditor filtering by file_name prefix |
| `src/components/tracking/ResolvedCommentsModal.tsx` | Major refactor: add Mark Resolved and Re-open Issue buttons inside modal, disable comments when resolved, fix scrolling |
| `src/pages/AdminReviewHistory.tsx` | Rename Mark Resolved buttons to Comment/Resolved |

### Database Changes
- Add `artifact_correction_resolved_at` and `artifact_correction_resolved_by` columns to be nullable/clearable (they already are) so "Re-open Issue" can set them back to null. No migration needed.

