

## Plan: Fix Missing Review Actions, Improve Failure Summary, and Red Field Audit Badge

### 1. Restore Missing ReviewActions Component

**File: `src/pages/ReviewInterview.tsx`**

The `ReviewActions` component was accidentally removed from the render output (lines 649-668 are blank where it should be). This is why the Pass/Fail buttons are not appearing.

- Restore the `<ReviewActions>` component in the sticky section (after the checklist, before the closing `</div>` at line 669)
- Pass all required props: `auditId`, `currentStatus`, `currentFileName`, `checklistCompleted`, `hasChecklistFailures`, `checklistFailureComments`, `reviewDurationSeconds`, `onReleaseLock`, `audioAnalysisComplete`, `pdfAnalysisComplete`, `onScrollToChecklist`, `onReviewCompleted`

### 2. Replace Raw Checklist Failure Summary with Feedback Statements in Fail Dialog

**File: `src/components/review/ReviewActions.tsx`**

Currently, when the failure dialog opens, `reviewComment` is pre-populated with the raw checklist output containing section headers and full question text (e.g., "**Documentation & Authorization:** - Q1: Was the interview recorded..."). Instead, it should use the same feedback statement format used in the Admin Review History PDF.

- Add the `CHECKLIST_FEEDBACK_STATEMENTS` mapping (questions 1-13) to `ReviewActions.tsx` (or extract to a shared utility)
- Add a `parseChecklistFeedback` function to extract question IDs and additional comments from the raw checklist comments
- In the `useEffect` that sets `reviewComment` from `checklistFailureComments`, transform the raw data into feedback statements format:
  - For each failed question, show: `"Q{id}: {feedback statement}"`
  - If there's an additional comment from the auditor, append it below
- This gives field managers/contractors clear, actionable failure reasons

### 3. Change "No Field Audit" Badge to Red

**File: `src/pages/ReviewInterview.tsx`**

- On line 619, change the badge styling from `variant="outline" className="text-muted-foreground ..."` to `className="bg-red-100 text-red-700 border-red-200 ..."` (or use `variant="destructive"` with appropriate sizing)
- Keep the `ShieldOff` icon

### Technical Summary

| File | Change |
|------|--------|
| `src/pages/ReviewInterview.tsx` | Restore `<ReviewActions>` component in sticky section (lines 649-668); change "No Field Audit" badge to red |
| `src/components/review/ReviewActions.tsx` | Add `CHECKLIST_FEEDBACK_STATEMENTS` map; transform raw checklist comments into feedback statements in the failure dialog's pre-populated comment |

