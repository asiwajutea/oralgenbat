

## Plan: Review Completion Auto-Load, Bulk Upload Re-Audit Logic, and Mobile Labels

### 1. Auto-Load Next Interview on Completion Page

**File: `src/pages/ReviewInterview.tsx`**

Modify the completion page (lines 461-493) to add:

- A 5-second countdown timer using `useState` and `useEffect` with `setInterval`
- Display the next interview ID (from the existing `nextAudit` query) below the countdown
- When countdown reaches 0, auto-navigate to `/review/{nextAuditId}`
- A "Go to Next Interview" manual button as fallback
- If `nextAudit` is null (no interviews left), show "No more interviews to review" with only the "Go to Dashboard" button and no countdown
- Clicking any manual navigation button cancels the countdown
- The countdown should pause/cancel if user clicks "Go to Interviews" or "Return to Dashboard"

The `nextAudit` query already exists (lines 182-216) and fetches the next available unreviewed audit with metadata. The `awaitingCount` query (lines 275-286) provides the count. Both are already enabled when `completionResult` is set.

### 2. Bulk Upload Artifact Correction Logic

The `artifact_correction` field on `audits` is a text array that can contain `'scanned_pdf'` and/or `'mobile_metadata'`. The new rules require checking this field to decide whether to send for re-audit or just replace the artifact.

**File: `src/components/tracking/BulkPdfUploadDialog.tsx`**

Changes to `handleFileSelect` (line ~94):
- Fetch `artifact_correction` alongside `id, file_name, file_url, status` from the audits query
- In the file classification logic (lines 120-128), when status is "Audit Failed":
  - Check if `artifact_correction` contains both `'scanned_pdf'` and `'mobile_metadata'`
  - If both: mark as replacement only (NOT re-audit). Set a new flag like `isPartialFix = true`
  - If only `'scanned_pdf'`: mark as re-audit (current behavior)

Changes to `processPdfFile` (line ~217):
- For `isPartialFix` files: instead of calling `mark_audit_for_reaudit`, do a regular update:
  - Update `file_url` to the new URL
  - Update `artifact_correction` to `['mobile_metadata']` (remove `'scanned_pdf'`)
  - Update `last_modified` to now
  - Do NOT change status or trigger re-audit

**File: `src/components/tracking/BulkMetadataUploadDialog.tsx`**

Same parallel changes:
- Fetch `artifact_correction` in the audits query (line ~98)
- In classification (lines 128-135), when status is "Audit Failed":
  - If both corrections needed: mark as replacement (partial fix), not re-audit
  - If only `'mobile_metadata'`: mark as re-audit (current behavior)

Changes to `processZipFile` (line ~198):
- For partial fix files: instead of calling `mark_audit_for_reaudit`:
  - Update `mobile_zip_url` and `mobile_zip_uploaded_at`
  - Update `artifact_correction` to `['scanned_pdf']` (remove `'mobile_metadata'`)
  - Update `last_modified` to now
  - Still invoke `process-mobile-zip` to parse metadata
  - Do NOT change status or trigger re-audit

### 3. Mobile Labels on Bulk Upload Buttons

**File: `src/pages/InterviewTracking.tsx`**

On lines 875-893, the bulk upload buttons show icons only on mobile (text is hidden with `hidden sm:inline`). Add tiny labels visible only on mobile:

- For Bulk Metadata button: add `<span className="sm:hidden text-[10px]">ZIP</span>` next to the icon
- For Bulk PDF button: add `<span className="sm:hidden text-[10px]">PDF</span>` next to the icon

### Technical Summary

| File | Change |
|------|--------|
| `src/pages/ReviewInterview.tsx` | Add 5-second auto-load countdown on completion page with next interview ID display and fallback navigation |
| `src/components/tracking/BulkPdfUploadDialog.tsx` | Fetch `artifact_correction`, add partial-fix logic for both-artifact failures (replace PDF + update correction to metadata-only) |
| `src/components/tracking/BulkMetadataUploadDialog.tsx` | Fetch `artifact_correction`, add partial-fix logic for both-artifact failures (replace metadata + update correction to PDF-only) |
| `src/pages/InterviewTracking.tsx` | Add tiny "PDF" and "ZIP" labels on mobile view for bulk upload buttons |

