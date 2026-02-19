## Plan: FM Dashboard Overhaul, Forgot Password, Manual Re-Audit Request

This plan addresses items across 4 areas: Field Manager Dashboard improvements, Auth page forgot password, failed interview modal manual re-audit button, and hiding reviewer identity from FMs.

---

### 1. Overhaul Field Manager Dashboard (`src/pages/FieldManagerDashboard.tsx`)

The current FM dashboard page needs a complete mobile optimization to mirror the auditor's interview page style.

**Changes:**

- **Add FilterSidebar integration with mobile filter icon**: Add a filter button (funnel icon) in the header that opens a sheet/drawer on mobile containing the FilterSidebar. On desktop, keep the existing sticky sidebar. Apply filters (status, interviewer ID, date range, interview ID) to the query.
- **Stats should reflect results from Field Manager's team only (not overall)**: The stat cards (Total, Awaiting, Re-Audit, Passed, Failed, Missing) should compute from the currently logged in Field Manager team.
- **Add correction-needed stat card**: When there are failed audits, show a stat card with counts for "PDF Only", "Metadata Only", and "Both" corrections needed. Derived from `artifact_correction` array on failed audits.
- **Mobile accordion improvements**:
  - Remove "Reviewed By" from the accordion (FM should not see who audited)
  - Remove "Review Comment" from accordion; instead show "Artifacts" badges only for failed interviews (showing which artifacts need correction)
  - The "View" button navigates to `/review/{id}` (already works)
- **Re-audit from dashboard**: When FM clicks Re-Audit, open the same `FailedInterviewModal` component (from tracking page) which handles bulk artifact upload rules, instead of the simpler `ReAuditDialog`

### 2. Hide "Reviewed By" from Field Managers on Review Page (`src/pages/ReviewInterview.tsx`)

**Changes:**

- On the review page's "Already reviewed" status block (lines 690-706), wrap the "reviewed by {name}" text in a role check: only show it for auditors/admins, hide it for field_managers and contractors.
- The review page already shows PDF + Metadata sections on mobile via the tab system, which matches the auditor view. Check the Mobile View for the Field MAnager's role to be sure it shows the PDF tab.

### 3. Add Forgot Password to Auth Page

**Files: `src/pages/Auth.tsx`, new `src/pages/ResetPassword.tsx`, `src/App.tsx**`

**Changes to Auth.tsx:**

- Add a "Forgot Password?" link below the password field on the login tab
- Add state and a simple dialog/inline form that accepts email and calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`
- Show a success toast after sending

**New ResetPassword.tsx page:**

- Create `/reset-password` route
- Check for `type=recovery` in URL hash
- Show a form to enter new password + confirm password
- Call `supabase.auth.updateUser({ password })` on submit
- Navigate to `/auth` on success

**Changes to App.tsx:**

- Add `<Route path="/reset-password" element={<ResetPassword />} />` as a public route (outside ProtectedRoute)

### 4. Add Manual Re-Audit Request Button to Failed Modal

**File: `src/components/tracking/FailedInterviewModal.tsx**`

**Changes:**

- Add a new button "Request Re-Audit (No Correction)" next to or below the "Submit for Re-Audit" button
- Add a tooltip explaining: "Use this when an interview was failed erroneously and no correction is needed. The interview will be resubmitted for review without any file changes."
- On click, call `mark_audit_for_reaudit` RPC with no new PDF/ZIP URLs, just a comment like "Manual re-audit request: no correction needed" plus any user-entered comment
- This skips the file validation requirement (`handleSubmit` currently requires at least one file)

---

### Technical Summary


| File                                               | Change                                                                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/pages/FieldManagerDashboard.tsx`              | Complete overhaul: add mobile filter icon/sheet, stats from filtered data, correction stat card, remove reviewed_by/review_comment from accordion, show artifacts for failed only, use FailedInterviewModal for re-audit |
| `src/pages/ReviewInterview.tsx`                    | Hide "reviewed by" text for field_manager/contractor roles                                                                                                                                                               |
| `src/pages/Auth.tsx`                               | Add "Forgot Password?" link with email input and `resetPasswordForEmail` call                                                                                                                                            |
| `src/pages/ResetPassword.tsx`                      | New page: password reset form using `updateUser({ password })`                                                                                                                                                           |
| `src/App.tsx`                                      | Add `/reset-password` public route                                                                                                                                                                                       |
| `src/components/tracking/FailedInterviewModal.tsx` | Add "Request Re-Audit (No Correction)" button with tooltip, calls `mark_audit_for_reaudit` RPC without file uploads                                                                                                      |
