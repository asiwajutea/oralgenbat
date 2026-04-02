

## Plan: New Checklist Question, Pass-with-Failures Flow, Burn Queue Scoping, Edit Filename, Mobile Nav Update

This plan covers 7 changes across the codebase.

---

### 1. Add New Checklist Question (Field Audit Proof)

**File: `src/components/review/AuditChecklist.tsx`**
- Insert a new question as ID 0 (or renumber all to start from 0) at the top of `CHECKLIST_ITEMS`:
  ```
  { id: 0, category: "A", categoryLabel: "Form & Document Review",
    question: "Was the interview audited by the Field Manager using the AVTool or any other proof of audit?" }
  ```
- Renumber existing questions: current Q1→Q1 stays but new question becomes Q0 or we shift all IDs up by 1 (new=1, old 1→2, etc). Best approach: prepend with id: 0 to avoid breaking existing saved checklist data.

**File: `src/components/review/ReviewActions.tsx`**
- Add feedback statement for Q0:
  ```
  0: "The interview failed because there is no proof that the interview was audited by the Field Manager."
  ```
- Add "No Proof of Field Audit" as a third artifact correction option (`no_field_audit`) in the fail dialog, alongside "Scanned PDF" and "Mobile Metadata"

**File: `src/components/fraud-dashboard/ChecklistAnalyticsTab.tsx`** — No code changes needed; it reads dynamically from saved checklist data.

**File: `src/hooks/useChecklistAnalytics.ts`** — No changes needed; it processes items dynamically from the JSONB data.

**File: `src/pages/AdminReviewHistory.tsx`** — The PDF export reads `review_comment` which already contains the parsed feedback. The artifact correction indicators need to handle `no_field_audit` with a new badge letter "F".

**File: `src/pages/InterviewTracking.tsx`** — The artifact correction badge display needs to handle `no_field_audit` → show "F" indicator.

**File: `src/components/tracking/FailedInterviewModal.tsx`** — Already reads `artifact_correction` from DB; no changes needed unless we want to display the "F" label.

---

### 2. Allow Passing Interviews with Failed Checklist Items

Currently, `canPass` is `false` when `hasChecklistFailures` is `true`. This needs to change.

**Database migration:**
- Add columns to `audits` table:
  - `passed_with_failures` (boolean, default false)
  - `pass_override_reason` (text, nullable)
  - `pass_override_action_plan` (text, nullable)

**File: `src/components/review/ReviewActions.tsx`**
- Change `canPass` logic: allow pass even when `hasChecklistFailures` is true
- When `hasChecklistFailures && user clicks Pass`: show a modified pass dialog requiring:
  - Reason(s) why the interview is being passed (required, textarea)
  - Action plan (optional, textarea)
  - List of failed checklist items displayed for context
- On submit: update audits with `status: "Audit Passed"`, `passed_with_failures: true`, `pass_override_reason`, `pass_override_action_plan`
- Remove the "Checklist has failed items - interview cannot pass" warning; replace with amber notice "Checklist has failed items - you will need to provide reasons if passing"

**File: `src/pages/ReviewInterview.tsx`**
- On the review completion page, if `passed_with_failures`, show a note: "Passed with override"

**File: `src/pages/InterviewTracking.tsx`** and **`src/pages/AdminReviewHistory.tsx`**
- For audits where `passed_with_failures` is true, show a small indicator (e.g., amber dot or "⚠" next to "Audit Passed" badge)
- Add ability to click/hover to view the override reason

**File: `src/pages/ReviewHistory.tsx`**
- Show override indicator for passed-with-failures interviews

---

### 3. Exclude Burned Interviews from Status Counts (FilterSidebar)

**File: `src/hooks/useStatusCounts.ts`**
- Fetch burned audit IDs (same pattern as tracking page) and exclude them from all status counting logic
- Add burned IDs query before the main audit fetch, then filter them out in the `forEach` loop

---

### 4. Scope "Sent to Burn" Card per User Role

**File: `src/pages/InterviewTracking.tsx`**
- Change the burned audit IDs query to also fetch `file_name` so we can scope by contractor
- For field managers: only count burned audits where `file_name` starts with their team's contractor prefix (or filter via interview_metadata join)
- For contractors/sub-contractors: filter burned audits by matching contractor_id from file_name prefix
- For admins/super_admins: show all burned counts (current behavior)
- The simplest approach: join `burn_queue` with `interview_metadata` on `audit_id` and filter by `contractor_id`, or extract contractor from `file_name` prefix

---

### 5. Add "Edit Filename" to Tracking Page Action Dropdown

**File: `src/pages/InterviewTracking.tsx`**
- Add a new dropdown menu item "Edit Filename" for interviews without metadata (`!interview.has_metadata`)
- On click: show a dialog/inline input to edit the filename
- On submit: update `audits.file_name` in the database
- Create a small `EditFilenameDialog` component inline or as a separate component

---

### 6. Add Burn Queue to Mobile Nav

**File: `src/components/MobileNav.tsx`**
- Add a `NavItem` for Burn Queue under the Operations section:
  ```tsx
  <NavItem to="/burn-queue" icon={Flame}>Burn Queue</NavItem>
  ```
- Show for roles that can see the tracking page (field_manager, contractor, admin, sub_contractor)

---

### 7. Display Override Reason for Passed-with-Failures Interviews

**File: `src/components/review/MetadataPanel.tsx`** or inline on review page
- If the audit has `passed_with_failures === true`, display a card/section showing:
  - "This interview was passed with failed checklist items"
  - The override reason
  - The action plan (if provided)

---

### Technical Summary

| Area | Files | Change |
|------|-------|--------|
| New checklist Q | `AuditChecklist.tsx`, `ReviewActions.tsx` | Add Q0 field audit question + feedback + artifact option |
| Pass with failures | DB migration, `ReviewActions.tsx` | Allow pass with reasons when checklist has failures |
| Status counts fix | `useStatusCounts.ts` | Exclude burned audit IDs from counts |
| Burn card scoping | `InterviewTracking.tsx` | Filter burn count by user's contractor scope |
| Edit filename | `InterviewTracking.tsx` | New dropdown action + dialog for renaming |
| Mobile nav | `MobileNav.tsx` | Add Burn Queue link |
| Override display | `ReviewActions.tsx`, tracking pages | Show indicators for passed-with-failures |

