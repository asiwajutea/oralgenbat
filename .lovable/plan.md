

## Plan: Enhance Mark as Resolved Feature

### 1. Fix Unread Message Counter (Per-User Read Tracking)

**Problem:** Currently, `is_read` is a single boolean on each comment row -- marking it `true` affects all users. We need per-user read tracking.

**Solution:** Create a new `artifact_comment_reads` table to track which comments each user has read.

**Database Migration:**
- Create table `artifact_comment_reads` with columns: `id` (uuid), `comment_id` (uuid, FK to artifact_correction_comments), `user_id` (uuid), `read_at` (timestamptz), with a unique constraint on `(comment_id, user_id)`
- Add RLS policies: users can insert/select/update their own reads
- Drop the `is_read` column from `artifact_correction_comments` (no longer needed)

**Code Changes:**
- `ResolvedCommentsModal.tsx`: When modal opens, upsert all visible comment IDs into `artifact_comment_reads` for the current user. Remove the old `is_read` update logic.
- `InterviewTracking.tsx`: Update the unread count query to use `artifact_comment_reads` -- count comments where `user_id != current_user` AND no matching row exists in `artifact_comment_reads` for the current user.

### 2. Fix ScrollArea in ResolvedCommentsModal

**Problem:** The comments area can't scroll; latest messages are truncated.

**Solution:** In `ResolvedCommentsModal.tsx`, give the `ScrollArea` a fixed max height (e.g., `max-h-[300px]`) and auto-scroll to the bottom when new comments arrive or when the modal opens.

### 3. Mark Resolved for ALL Interviews Without Metadata

**Problem:** Currently the Mark Resolved button only shows for `Audit Failed` interviews. The user wants it on all interviews without metadata, regardless of status.

**Code Changes:**
- `InterviewTracking.tsx` (both mobile and desktop views): Change the condition from `interview.status === "Audit Failed"` to also show the Mark Resolved / Resolved button when `!interview.has_metadata` (for any status).
- `ReviewInterview.tsx`: Change the condition from `audit.status === "Audit Failed"` to also show when there's no metadata.

### 4. Visual Indicator on Admin Review History Page

**Problem:** No way to see which interviews are resolved in the table.

**Code Changes:**
- `AdminReviewHistory.tsx`: In the Status column of the table, add a small green "Resolved" badge next to the failed badge when `audit.artifact_correction_resolved_at` is set. Also add Mark Resolved / View Resolution buttons in a new Actions column or inline.

### 5. Notification Click Navigates to Review Page with Comment Box Open

**Problem:** Clicking a comment reply notification doesn't navigate to the right page.

**Code Changes:**
- `NotificationBell.tsx`: Add handling for `comment_reply` and `resolution_comment` notification types. Navigate to `/review/{audit_id}?showComments=true`.
- `ReviewInterview.tsx`: Read the `showComments` query parameter on mount. If present, auto-open the `ResolvedCommentsModal`.

### Technical Summary of All File Changes

| File | Change |
|------|--------|
| **Database migration** | Create `artifact_comment_reads` table, drop `is_read` from `artifact_correction_comments` |
| `src/components/tracking/ResolvedCommentsModal.tsx` | Fix scroll (add max-h + auto-scroll), switch read tracking to `artifact_comment_reads` table, remove old `is_read` logic |
| `src/pages/InterviewTracking.tsx` | Update unread count query to use `artifact_comment_reads`, show Mark Resolved button for all no-metadata interviews (not just failed), update `resolvedAuditIds` filter |
| `src/pages/ReviewInterview.tsx` | Show Mark Resolved for no-metadata interviews, read `?showComments=true` query param to auto-open comments modal |
| `src/pages/AdminReviewHistory.tsx` | Add resolved visual indicator (green badge) in table rows, add Mark Resolved / View Resolution action buttons |
| `src/components/NotificationBell.tsx` | Handle `comment_reply` and `resolution_comment` notification types to navigate to `/review/{audit_id}?showComments=true` |

