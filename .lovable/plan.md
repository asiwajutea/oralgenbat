

## Plan: Field Audit Badge + Post-Review Confirmation Page

### Change 1: Show "No Field Audit" badge when not found

**File: `src/pages/ReviewInterview.tsx`** (lines 502-507)

Currently the field audit badge only appears when `fieldAuditData?.found` is true. Add an `else` branch to show a gray/muted badge indicating "No Field Audit Record" when the query has completed but no record was found.

- When `fieldAuditData?.found === true`: green "Field Audited - Date" badge (keep as-is)
- When `fieldAuditData` is loaded and `found === false`: gray "No Field Audit" badge with a different icon (e.g., `ShieldOff` or `ShieldX`)
- While loading: no badge shown (avoid flicker)

### Change 2: Show confirmation page after Pass/Fail instead of auto-navigating

**File: `src/components/review/ReviewActions.tsx`**

Instead of navigating to the next interview or home after passing/failing, show a confirmation screen.

**New state**: `showCompletionPage` (boolean) and `completionResult` ("passed" | "failed")

**After successful pass/fail**:
- Set `showCompletionPage = true` and `completionResult` accordingly
- Do NOT navigate away

**New query**: Fetch count of interviews "awaiting review" that have both PDF and metadata available:
- Query `audits` joined with `interview_metadata` where status is "Pending" or "Awaiting Review"
- This gives the "ready for review" count

**Confirmation page UI** (rendered as a full-screen overlay or replacing the action bar):
- Large check/X icon with "Interview Passed" or "Interview Failed"
- Text: "X interviews are awaiting review"
- Button: "Go to Interviews" (navigates to `/interviews`)
- Secondary button: "Return to Dashboard" (navigates to `/`)

**Props change**: Add a callback `onReviewCompleted` to `ReviewActionsProps` so the parent (`ReviewInterview.tsx`) can show the confirmation page full-screen instead of the review content.

**Implementation approach**: 
- Add `onReviewCompleted: (result: "passed" | "failed") => void` prop to `ReviewActions`
- In `ReviewInterview.tsx`, add state `completionResult` and when set, render a full-page confirmation instead of the review layout
- The confirmation page queries the awaiting-review count and shows the summary

### Technical Details

| File | Change |
|------|--------|
| `src/pages/ReviewInterview.tsx` | Add "No Field Audit" badge in else branch (line ~502). Add `completionResult` state. Render confirmation page when set. |
| `src/components/review/ReviewActions.tsx` | Replace `navigate()` calls after pass/fail with `onReviewCompleted` callback. Add `onReviewCompleted` to props interface. Remove `nextAuditId` navigation logic. |

**Confirmation page layout:**
```text
+------------------------------------------+
|                                          |
|         [CheckCircle / XCircle]          |
|      Interview Passed / Failed           |
|                                          |
|   12 interviews awaiting review          |
|                                          |
|  [Go to Interviews]  [Return to Home]    |
|                                          |
+------------------------------------------+
```

The awaiting-review count query:
```sql
SELECT count(*) FROM audits a
INNER JOIN interview_metadata m ON m.audit_id = a.id
WHERE a.status IN ('Pending', 'Awaiting Review')
```

