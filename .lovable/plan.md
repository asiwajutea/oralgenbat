
# Implementation Plan: Multi-Page Fixes and Enhancements

## Overview
This plan addresses changes across 4 pages: Admin Review History, ZIP Diagnostics, Interviews (Index), and Team Assignments.

---

## 1. Admin Review History Page Fixes

### 1.1 Add Artifact-Based Status Filters
**Location**: `src/pages/AdminReviewHistory.tsx`

**Current State**: Status filter only has "All Statuses", "Passed", and "Failed" options.

**Changes**:
- Add three new filter options under the Status dropdown:
  - "Failed - PDF Issue" (filters by `artifact_correction` containing "scanned_pdf")
  - "Failed - Metadata Issue" (filters by `artifact_correction` containing "mobile_metadata")
  - "Failed - Both Issues" (filters by `artifact_correction` containing both)

**Implementation**:
- Modify the query logic (lines 217-246) to handle these new filter values
- Add filter options to the Select component (lines 718-733)
- When one of these filters is selected, query should:
  1. Filter by `status = 'Audit Failed'`
  2. Check `artifact_correction` array for the appropriate values

### 1.2 Fix Search Box Debouncing
**Location**: `src/pages/AdminReviewHistory.tsx` (lines 708-716)

**Current State**: Search triggers a query on every keystroke because `searchTerm` directly affects the query.

**Changes**:
- Add local state for input value separate from the actual filter value
- Implement debouncing using `useEffect` with a timeout (300-500ms delay)
- Only update the filter after the user stops typing

**Implementation Pattern** (from TeamAssignments.tsx reference):
```typescript
const [searchInput, setSearchInput] = useState(searchTerm);

useEffect(() => {
  const timer = setTimeout(() => {
    setSearchTerm(searchInput);
    setCurrentPage(1);
  }, 400);
  return () => clearTimeout(timer);
}, [searchInput]);
```

### 1.3 Add Filter Count Display
**Location**: `src/pages/AdminReviewHistory.tsx`

**Changes**:
- Display the filtered result count prominently in the UI
- Add a badge or text showing "{count} results" near the filters
- The count already exists in `data?.totalCount` - just needs to be displayed more prominently

---

## 2. ZIP Diagnostics Page Fix

### 2.1 Fix Diagnostic Status Logic
**Location**: `src/pages/ZipDiagnostics.tsx` (lines 131-156)

**Current State**: The status determination logic is:
- `valid`: has BOTH metadata AND photos
- `corrupted`: has NEITHER metadata NOR photos  
- `missing_data`: has one but not the other

**Problem**: A ZIP file can be valid even without photos if it only contains metadata. The current logic incorrectly marks ZIPs as "corrupted" if photos weren't extracted (which might not be expected for all ZIPs).

**Changes**:
- Revise the status determination logic:
  - `valid`: has metadata (photos are optional for validity)
  - `corrupted`: no metadata extracted AND ZIP was uploaded (processing failed)
  - `missing_data`: has metadata but missing expected photos, OR has photos but no metadata

**Updated Logic**:
```typescript
let status: "valid" | "corrupted" | "missing_data";
if (hasMetadata) {
  // If we have metadata, the ZIP was parsed successfully
  // Photos are optional - their absence doesn't mean corruption
  status = "valid";
} else if (!hasMetadata && !hasPhotos) {
  // Nothing was extracted - ZIP processing failed
  status = "corrupted";
} else {
  // Edge case: has photos but no metadata (unlikely but possible)
  status = "missing_data";
}
```

---

## 3. Interviews Page (Index) - Artifact-Ready Filter

### 3.1 Add "Ready for Review" Filter for Admin Roles
**Location**: `src/pages/Index.tsx` and `src/components/FilterSidebar.tsx`

**Current State**: "Awaiting Review" shows all pending interviews including those without complete artifacts.

**Target Roles**: Super Admin, Sub-Contractor, Field Manager

**Changes**:

**FilterSidebar.tsx**:
- Add a new status option: "Ready for Review" that only shows interviews with:
  1. Status = "Pending" or "Awaiting Review"
  2. Has PDF (`file_url` is not null)
  3. Has metadata (via `interview_metadata` join)
  4. Is not corrupted (metadata record exists)

**Index.tsx** (fetchAudits function):
- When "Ready for Review" filter is selected:
  1. Get audit IDs that have corresponding `interview_metadata` records
  2. Filter to audits with `file_url IS NOT NULL` and `mobile_zip_url IS NOT NULL`
  3. Only show these to authorized roles (super_admin, sub_contractor, field_manager)

**Implementation Approach**:
- Add new filter option "Ready for Review" to `statusOptions` in FilterSidebar (visible only for authorized roles)
- In Index.tsx, handle this special filter by:
  1. First querying `interview_metadata` to get audit IDs with valid metadata
  2. Then filtering audits to include only those with both `file_url` and `mobile_zip_url` present
  3. Joining the two result sets

---

## 4. Team Assignments - Metadata Handling for Re-audits

### 4.1 Understanding Current Behavior
**Current Flow**:
1. Interview fails audit
2. New metadata ZIP is uploaded for re-audit (via `process-mobile-zip`)
3. The old metadata is DELETED and new metadata is inserted immediately
4. Interview goes through re-audit
5. If passed, it's assigned to a team and exported

**Requested Behavior**:
1. When metadata is uploaded for re-audit, store it TEMPORARILY
3. The old metadata is DELETED and new metadata is inserted immediately
4. Interview goes through re-audit
5. If passed, it's assigned to a team and exported
2. During export, include the updated metadata for re-audited interviews

### 4.2 Proposed Solution Approach

**Option A - Deferred Metadata Replacement** (Recommended):
This would require significant architectural changes:
- Create a staging table `interview_metadata_pending` to hold re-audit metadata
- Modify `process-mobile-zip` to insert into staging table if audit has `is_re_audit = true`
- Create a trigger/function that moves staging metadata to main table when status changes to "Audit Passed"

**Option B - Track Metadata Version** (Simpler):
- Add a `version` or `replaced_at` column to `interview_metadata`
- Track which metadata is associated with which re-audit cycle
- When exporting, always use the latest metadata

### 4.3 Export Metadata with PDFs
**Location**: `supabase/functions/export-team-pdfs/index.ts`

**Current State**: Only exports PDF files (file_url), not metadata ZIPs.

**Changes**:
- Modify the export function to also fetch `mobile_zip_url` for each audit that is re-audited and has their metadata replaced
- Include both PDF and ZIP in the export response
- Client-side (TeamAssignments.tsx) needs to download and include both in the final ZIP. Only the latest Metadata of the re-audited interviews are downloaded. If the interview is not re-audited, only export the PDF. If the interview is re-audited but the metadata is not replaced, only export the PDF.

**Implementation**:
```typescript
// In export-team-pdfs function
const { data: audits } = await supabase
  .from('audits')
  .select('id, file_name, file_url, mobile_zip_url')  // Add mobile_zip_url
  .in('id', auditIds);

const fileList = audits?.map(audit => ({
  fileName: `${audit.file_name}.pdf`,
  url: audit.file_url,
  auditId: audit.id,
  metadataUrl: audit.mobile_zip_url,  // Include metadata URL
  metadataFileName: `${audit.file_name}_metadata.zip`,
})) || [];
```

**Client-side changes** (`TeamAssignments.tsx`):
- When building the ZIP, also download and include metadata ZIPs if available

---

## Summary of Files to Modify

| File | Changes |
|------|---------|
| `src/pages/AdminReviewHistory.tsx` | Add artifact filters, debounce search, add filter count |
| `src/pages/ZipDiagnostics.tsx` | Fix status determination logic |
| `src/pages/Index.tsx` | Handle "Ready for Review" filter |
| `src/components/FilterSidebar.tsx` | Add "Ready for Review" option for authorized roles |
| `supabase/functions/export-team-pdfs/index.ts` | Include metadata ZIPs in export only for interview that are re-audited |
| `src/pages/TeamAssignments.tsx` | Download and include metadata in ZIP exports |

---

## Technical Details

### Database Considerations
The `artifact_correction` column is an array storing values like:
- `'scanned_pdf'` - PDF needs correction
- `'mobile_metadata'` - Metadata/ZIP needs correction

Filtering by array contents uses PostgreSQL's `@>` (contains) operator or Supabase's `.contains()` method.

### Search Debouncing Pattern
```typescript
const [inputValue, setInputValue] = useState(searchTerm);
const [debouncedValue, setDebouncedValue] = useState(searchTerm);

useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedValue(inputValue);
  }, 400);
  return () => clearTimeout(timer);
}, [inputValue]);

// Use debouncedValue for queries
```

### Artifact Filter Query Pattern
```typescript
// For "Failed - PDF Issue"
query = query
  .eq("status", "Audit Failed")
  .contains("artifact_correction", ["scanned_pdf"]);

// For "Failed - Metadata Issue"  
query = query
  .eq("status", "Audit Failed")
  .contains("artifact_correction", ["mobile_metadata"]);

// For "Failed - Both"
query = query
  .eq("status", "Audit Failed")
  .contains("artifact_correction", ["scanned_pdf", "mobile_metadata"]);
```
