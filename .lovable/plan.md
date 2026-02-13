

## Plan: Fix "Ready for Review" Loading and Add Interview Naming Validation

### 1. Fix 400 Bad Request When Loading "Ready for Review" Interviews

**Root Cause:** In `src/pages/Index.tsx` line 205, the `.or()` filter string contains:
```
and(status.in.(Pending,Awaiting Review),file_url.not.is.null,mobile_zip_url.not.is.null)
```
The space in `Awaiting Review` breaks PostgREST's query parser, causing a 400 Bad Request. PostgREST `.or()` string filters require spaces to be quoted.

**Fix:** In `src/pages/Index.tsx` line 205, wrap the status values with double quotes:
```
and(status.in.("Pending","Awaiting Review"),file_url.not.is.null,mobile_zip_url.not.is.null)
```

Similarly, check line 196 which has `status.eq.Awaiting Review` -- this also needs quoting:
```
and(is_re_audit.eq.true,status.eq."Awaiting Review",reviewed_by.eq.${profile.full_name})
```
And line 198:
```
and(is_re_audit.eq.true,status.eq."Awaiting Review")
```

---

### 2. Add Interview Naming Format Validation

**Requirement:** Every uploaded PDF or metadata file must match the pattern `NG\d{2}_\d{3,4}_\d{8}_\d{4}` (e.g., `NG71_650_20250702_1233`). No hyphens allowed, only underscores.

**Approach:** Create a shared validation utility function and apply it in all upload entry points.

#### a. Create validation utility
Add to `src/lib/utils.ts`:
```typescript
export function isValidInterviewName(name: string): boolean {
  return /^NG\d{2}_\d{3,4}_\d{8}_\d{4}$/.test(name);
}
```

#### b. Apply validation in these upload components:
- **`src/components/UploadDialog.tsx`** (single/multi PDF upload on Interviews page): Validate each filename (minus `.pdf` extension) before upload. Reject invalid filenames with a toast error showing which files are invalid.
- **`src/components/BulkZipUploadDialog.tsx`** (bulk ZIP upload on Interviews page): Validate each filename (minus `.zip` extension) before upload.
- **`src/components/tracking/BulkMetadataUploadDialog.tsx`** (bulk metadata upload on Tracking page): Validate each ZIP filename before matching.
- **`src/components/tracking/BulkPdfUploadDialog.tsx`** (bulk PDF upload on Tracking page): Validate each PDF filename before matching.
- **`src/components/CombinedUploadDialog.tsx`** (combined upload): Validate the PDF filename before upload.

In each case, files with invalid names will be flagged in the file list with an error badge and excluded from upload. A toast will inform the user which files have invalid names and the expected format.

---

### Technical Summary

| File | Changes |
|------|---------|
| `src/pages/Index.tsx` | Quote "Awaiting Review" in `.or()` filter strings (lines 196, 198, 205) to fix 400 Bad Request |
| `src/lib/utils.ts` | Add `isValidInterviewName()` validation function |
| `src/components/UploadDialog.tsx` | Validate filenames before upload, reject invalid ones |
| `src/components/BulkZipUploadDialog.tsx` | Validate filenames before upload |
| `src/components/tracking/BulkMetadataUploadDialog.tsx` | Validate filenames before upload |
| `src/components/tracking/BulkPdfUploadDialog.tsx` | Validate filenames before upload |
| `src/components/CombinedUploadDialog.tsx` | Validate filenames before upload |
