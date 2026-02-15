

## Plan: Fix Filter Counts, Tracking Page Limits, Move Payment Stats, Fix P/M/B Indicators, and Change Date Column

### 1. Fix "Ready for Review" Count in Filter Sidebar

**Problem:** The sidebar shows 35 but the actual query returns 161 results. The `useStatusCounts` hook checks for actual `interview_metadata` records (`hasMetadata`), while the Interviews page query uses `mobile_zip_url IS NOT NULL` as proxy. Many interviews have `mobile_zip_url` set but no metadata record (e.g., processing failed).

**Fix in `src/hooks/useStatusCounts.ts`:**
- Change the "Ready for Review" count at line 139 from `hasCompleteArtifacts` (which uses metadata join) to `!!audit.file_url && !!audit.mobile_zip_url` to match the actual query behavior on the Interviews page.

---

### 2. Fix Tracking Page Loading Only 1000 Interviews

**Problem:** Despite `.limit(50000)`, the database default row limit caps results at 1000. The tracking page needs to fetch all interviews.

**Fix in `src/pages/InterviewTracking.tsx`:**
- Replace the single `.limit(50000)` query with a paginated fetch loop using `.range()` in batches (e.g., 1000 at a time) until all records are retrieved. This bypasses the default row limit.

---

### 3. Move "Assigned to Data Entry, Paid, Assigned Not Paid" Stats to Homepage

**Problem:** These payment stat cards are on the tracking page but should be on each role's homepage dashboard instead.

**Changes:**
- **Remove** the payment stats section (lines 926-961) and the `paymentStats` query (lines 379-399) from `src/pages/InterviewTracking.tsx`
- **Add** payment stat cards to these homepage dashboard components:
  - `src/components/home/AdminDashboard.tsx`
  - `src/components/home/ContractorDashboard.tsx`
  - `src/components/home/FieldManagerDashboard.tsx`
  - `src/components/home/SubContractorDashboard.tsx`
  - `src/components/home/AuditorDashboard.tsx`
  - `src/components/home/QAManagerDashboard.tsx`
  - `src/components/home/DataEntryClerkDashboard.tsx`

Each dashboard will include a query fetching "Assigned to Data Entry" count (from `interview_assignments`), "Paid" count (from `payment_records`), and "Assigned Not Paid" (difference), displayed in a row of 3 stat cards.

---

### 4. Fix P/M/B Artifact Correction Indicators

**Problem:** The tracking page checks for `artifactCorrection.includes("metadata")` but the actual value stored in the database is `"mobile_metadata"` (set by the review form's checkbox). So the M and B badges never appear -- only P shows.

**Fix in `src/pages/InterviewTracking.tsx` (line 701):**
- Change `artifactCorrection.includes("metadata")` to `artifactCorrection.includes("mobile_metadata")` so it matches the stored value.

Also fix the same issue in `src/components/tracking/FailedInterviewModal.tsx` and `src/pages/AdminReviewHistory.tsx` if they use the same check.

---

### 5. Change Date Column to Show Last Modified Date

**Problem:** The Date column shows `interview_date` (from metadata) but should show the most recent activity date (reviewed, file replaced, etc.).

**Fix in `src/pages/InterviewTracking.tsx`:**
- Add `last_modified` to the `TrackingInterview` interface and populate it from `audits.last_modified`
- In the data mapping (line 318), add: `last_modified: audit.last_modified || audit.uploaded_at`
- Change the table header from "Date" to "Last Modified" and sort by `last_modified`
- Change the cell rendering from `interview.interview_date` to formatted `interview.last_modified`
- Update the mobile accordion view similarly

---

### Technical Summary

| File | Changes |
|------|---------|
| `src/hooks/useStatusCounts.ts` | Use `mobile_zip_url` proxy for "Ready for Review" count instead of metadata join |
| `src/pages/InterviewTracking.tsx` | Paginated fetch for all interviews; remove payment stats; fix `"metadata"` to `"mobile_metadata"` in P/M/B indicators; change Date column to Last Modified |
| `src/components/home/AdminDashboard.tsx` | Add payment stat cards |
| `src/components/home/ContractorDashboard.tsx` | Add payment stat cards |
| `src/components/home/FieldManagerDashboard.tsx` | Add payment stat cards |
| `src/components/home/SubContractorDashboard.tsx` | Add payment stat cards |
| `src/components/home/AuditorDashboard.tsx` | Add payment stat cards |
| `src/components/home/QAManagerDashboard.tsx` | Add payment stat cards |
| `src/components/home/DataEntryClerkDashboard.tsx` | Add payment stat cards |

