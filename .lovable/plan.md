

## Plan: Fix Search/Loading Issues, Add Visual Indicators, Progress Trackers, and Bulk PDF Upload

### 1. Fix "Can't Load Audit" for Ready for Review (Super Admin)

**Problem:** `ReviewInterview.tsx` line 139 uses `.single()` to fetch the audit record. If the RLS policy fails to return the row (or an unexpected condition occurs), `.single()` throws an error, causing the query to fail and showing "Audit Not Found".

**Fix:**
- `src/pages/ReviewInterview.tsx` line 139: Change `.single()` to `.maybeSingle()` on the audit query itself. This prevents the query from throwing when no row is returned and instead shows the "Audit Not Found" message gracefully.
- Additionally, check that the `is_user_approved` function correctly evaluates for the super admin user. If the profile's `is_approved` field is `false`, no audits will be visible. Verify via a database query.

### 2. Fix Interviews Not Found on Tracking Page

**Problem:** The Interview Tracking page fetches audits with `.limit(5000)` and then applies client-side role-based filtering. Interviews like `NG71_704_20260120_1210` are found on the Interviews page but not on the Tracking page because:
- The `.limit(5000)` may truncate results if the total exceeds 5000
- For non-super-admin roles, the filtering by `teamAssignments` interviewer codes may exclude interviews whose interviewer code (e.g., "704") is not in the user's team assignments

**Fix:**
- `src/pages/InterviewTracking.tsx` line 261: Remove the `.limit(5000)` or increase it significantly (e.g., 50000) for super_admin users
- For super_admin, skip role-based filtering entirely (lines 356-370 already have this, but the limit is applied before filtering)
- Add a search input that's independent of client-side filtering -- move the search field outside the "Filters" panel so it's always visible (currently the search is inside the collapsible filter panel)

### 3. Speed Up Bulk Metadata Upload and Improve Progress Bar

**Problem:** The bulk metadata upload processes files in concurrent batches of 5, but the progress indicator only updates in 3 discrete jumps (0% -> 50% -> 75% -> 100%) per file, making it feel stuck. The processing step (calling `process-mobile-zip` edge function) is the slowest part.

**Fix:**
- `src/components/tracking/BulkMetadataUploadDialog.tsx`:
  - Add an overall progress bar showing "X of Y files completed" at the top of the file list
  - Show more granular per-file status text: "Uploading..." -> "Processing metadata..." -> "Complete"
  - Add a file counter label like "Processing file 3 of 15..." above the file list during upload
  - Show elapsed time during upload

### 4. Add Artifact Correction Visual Indicator on Tracking Page

**Problem:** The Review History page shows P (PDF), M (Metadata), or B (Both) badges next to "Failed" status to indicate which artifacts need correction. The Tracking page doesn't have this.

**Fix:**
- `src/pages/InterviewTracking.tsx`: In the Status column (both mobile and desktop views), when an interview has `status === "Audit Failed"` and `artifact_correction` is set, show small colored badges:
  - "P" badge if `artifact_correction` includes "scanned_pdf" 
  - "M" badge if `artifact_correction` includes "metadata"  
  - "B" badge if both are present
- Match the styling from `AdminReviewHistory.tsx` (small rounded badges next to the Failed badge)

### 5. Add Visual Upload Progress for PDF Upload on Interviews Page

**Problem:** The `UploadDialog.tsx` component already has per-file progress bars using XHR `upload.progress` events, but there's no overall progress indicator showing how many files have been uploaded out of the total.

**Fix:**
- `src/components/UploadDialog.tsx`: Add an overall progress bar at the top during upload showing "Uploading X of Y files" with a computed overall percentage
- The per-file progress already exists, so this is a small addition

### 6. Add Bulk PDF Upload on Tracking Page

**Problem:** The tracking page only has bulk metadata (ZIP) upload. The user wants bulk PDF upload following the same matching rules.

**Fix:**
- Create a new component `src/components/tracking/BulkPdfUploadDialog.tsx` modeled on `BulkMetadataUploadDialog.tsx`:
  - Accept multiple PDF files
  - Match each PDF filename to an existing audit by `file_name`
  - For matched files: upload the PDF to `audit-pdfs` storage bucket and update `audits.file_url`
  - For failed interviews: trigger re-audit via `mark_audit_for_reaudit` RPC (same as metadata upload)
  - Show the same matching summary (new/replace/re-audit/unmatched badges)
  - Show per-file progress and overall progress
  - Process in concurrent batches of 5
- `src/pages/InterviewTracking.tsx`: Add a "Bulk PDF Upload" button next to the existing "Bulk Upload" button in the header area, or combine them into a dropdown menu

---

### Technical Summary

| File | Changes |
|------|---------|
| `src/pages/ReviewInterview.tsx` | Change `.single()` to `.maybeSingle()` on audit query (line 139) |
| `src/pages/InterviewTracking.tsx` | Remove/increase `.limit(5000)`, add artifact correction badges (P/M/B) in status column, add Bulk PDF Upload button |
| `src/components/tracking/BulkMetadataUploadDialog.tsx` | Add overall progress counter, better status labels, elapsed time |
| `src/components/UploadDialog.tsx` | Add overall upload progress bar showing "X of Y files" |
| `src/components/tracking/BulkPdfUploadDialog.tsx` | **New file** -- Bulk PDF upload dialog following same pattern as BulkMetadataUploadDialog |

