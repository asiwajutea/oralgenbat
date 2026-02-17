## Plan: Fix Auto-Load Navigation, Show Full Interview ID, and Suggest Checklist Regrouping

### 1. Fix Auto-Load Countdown Loop and Navigation

**Problem**: When the countdown reaches 0, `navigate(/review/${nextAudit.id})` is called, but React Router reuses the same `ReviewInterview` component. The `completionResult` state remains set, so the countdown `useEffect` immediately restarts -- creating an infinite loop. The same issue affects the "Go to Next Interview" button.

**File: `src/pages/ReviewInterview.tsx**`

**Fix**: Reset `completionResult` to `null` before navigating, and use `window.location.href` as a fallback to force a full page reload when navigating to the next interview. This ensures the component remounts cleanly.

Changes to the auto-navigate effect (line 349-353):

- Before navigating, call `cancelCountdown()` and `setCompletionResult(null)`
- Navigate using `navigate()` with `{ replace: true }` to avoid back-button issues

Changes to the countdown start effect (line 330-346):

- Add a guard: only start the countdown if `countdownRef.current` is not already running, preventing duplicate intervals

### 2. Show Full Interview ID (file_name) Instead of UUID

**Problem**: Line 524 shows `nextAudit.id.slice(0, 8)...` which displays a truncated UUID (e.g., "ae6baa19..."). The user wants the full interview name like "NG71_650_20250405_1234".

**File: `src/pages/ReviewInterview.tsx**`

Changes to the `nextAudit` query (lines 183-220):

- Add `file_name` to the select: `select("id, file_name, locked_by, locked_at, interview_metadata!inner(id)")`
- Return `{ id: available.id, file_name: available.file_name }` instead of just `{ id: available.id }`

Changes to the completion page display (line 524):

- Replace `nextAudit.id.slice(0, 8)...` with `nextAudit.file_name` to show the full interview ID

### 3. Checklist Regrouping Suggestion

The current grouping is:

- A. Documentation and Authorization (Q1-Q4)
- B. Data Consistency and Accuracy (Q5-Q9)
- C. Form Structure and Completeness (Q10)
- D. Media Verification (Q11-Q13)

Proposed regrouping based on auditor workflow (review PDF first, then cross-check data, then check media):

**Group A: Form and Document Review** (4 questions -- things checked by looking at the scanned PDF)

1. Was the interview recorded on the FSI Standard Interview Collection Form?
2. Is the Authorization Form signed and dated, and if marked "X," is there a witness signature?
3. Is the Field Manager Checklist fully checked and signed?
4. Are the pages numbered correctly and in sequence? *(moved from old Group C)*

**Group B: Data Cross-Check** (6 questions -- comparing PDF content against mobile app)  
5. Do the interviewee's name and age on the header and Authorization Form match the information in the mobile app?  
6. Does the total number of names on the header match the total names written on the collection form?  
7. Does the folder name written on the collection form header match the interview date and the interview ID?  
8. Does the earliest ancestor's name on the collection form match the one in the mobile app?  
9. Are the dates and places of birth recorded for the interviewee, the spouse, and the interviewee's children?  
10. Does each name on the collection form have a unique RIN, a relationship code, and a gender?  
  
**Group C: Media Verification** (3 questions -- photos and audio)  
11. Are all photos in the mobile app clear, relevant, and correctly captured?  
12. Is the full Authorization Form clearly visible in the uploaded image?  
13. Can the Field Agent and interviewee be clearly and easily heard in both the Family Story and Pedigree audio files?

**Rationale**: This groups questions by what the auditor is physically looking at during review:

- Group A: You look at the scanned PDF to check the form structure, signatures, and page numbering -- all in one pass
- Group B: You cross-reference the PDF data against mobile app data -- comparing names, ancestors, RINs, dates
- Group C: You check photos and listen to audio files

This eliminates back-and-forth between the PDF and other panels. Please review and let me know if you'd like any adjustments before I implement.

### Technical Summary


| File                                       | Change                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/ReviewInterview.tsx`            | Fix countdown loop by resetting state before navigation; add `file_name` to nextAudit query; display full interview ID on completion page |
| `src/components/review/AuditChecklist.tsx` | Regroup checklist items: move Q10 (page numbering) into Group A, renumber Q4-Q10, rename categories (pending user approval of regrouping) |
| `src/components/review/ReviewActions.tsx`  | Update `CHECKLIST_FEEDBACK_STATEMENTS` mapping to match new question IDs if regrouping is approved                                        |
