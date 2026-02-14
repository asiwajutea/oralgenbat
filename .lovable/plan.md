

## Plan: Fix "Ready for Review" Filter and Add Sorting + Delete Metadata Button

### 1. Fix "Ready for Review" Filter (Root Cause: URL Too Long)

**Root Cause:** The "Ready for Review" filter (lines 151-172 in `Index.tsx`) fetches ALL 1,135+ `audit_id` values from `interview_metadata` and passes them into a `.in("id", auditIdsWithMetadata)` query parameter. PostgREST sends filters as URL query parameters, and 1,135 UUIDs exceed the maximum URL length, causing a silent failure that triggers "Failed to load audits".

**Fix:** Remove the client-side metadata ID fetch entirely. Instead, since `mobile_zip_url` is set when a ZIP (containing metadata) is uploaded, use `mobile_zip_url IS NOT NULL` as a reliable proxy for "has metadata". The query already checks `file_url IS NOT NULL` and `mobile_zip_url IS NOT NULL`, which together mean "has both PDF and metadata". No need to cross-reference the `interview_metadata` table at all.

**Changes in `src/pages/Index.tsx`:**
- Lines 151-172 (standalone "Ready for Review" filter): Replace the metadata fetch + `.in()` approach with a simple query:
  ```
  query = query
    .in("status", ["Pending", "Awaiting Review"])
    .not("file_url", "is", null)
    .not("mobile_zip_url", "is", null);
  ```
- Lines 202-205 (combined filter with "Ready for Review"): Already uses the correct approach with `.or()` string -- no change needed here.

This eliminates the metadata fetch entirely and keeps the query URL short.

---

### 2. Sort "Awaiting Review" -- Complete Artifacts First

**Requirement:** When "Awaiting Review" filter is selected, interviews with both PDF and metadata (green check) should appear at the top.

**Fix in `src/pages/Index.tsx`:** After fetching the audits data (line 244), when the "Awaiting Review" filter is active, sort the results client-side so that audits with both `file_url` and `mobile_zip_url` (and metadata in `metadataMap`) appear first:

- After `setAudits(filteredData)`, check if "Awaiting Review" is in the active filters
- Sort: audits with both `file_url` AND `mobile_zip_url` non-null go to the top
- To also check for actual metadata presence, fetch metadata IDs only for the current page of audits (max 10-50 IDs, not 1000+) and use that for sorting

Actually, since we already know `mobile_zip_url` being set means metadata was uploaded, we can sort purely client-side:
```typescript
filteredData.sort((a, b) => {
  const aReady = a.file_url && a.mobile_zip_url ? 1 : 0;
  const bReady = b.file_url && b.mobile_zip_url ? 1 : 0;
  return bReady - aReady; // Ready ones first
});
```

This sorting applies when "Awaiting Review" is among the selected status filters.

---

### 3. Add "Delete Metadata" Button (Admin/Super Admin Only)

**Requirement:** For interviews that have metadata uploaded, show a delete metadata button. Only admin and super_admin can use it.

**Changes in `src/components/AuditTable.tsx`:**
- Add a new function `handleDeleteMetadata(auditId)` that:
  1. Confirms with the user
  2. Deletes the row from `interview_metadata` where `audit_id = auditId`
  3. Deletes associated `interview_photos` where `audit_id = auditId`
  4. Deletes storage files from `mobile-zips` bucket for the audit
  5. Updates `audits` table: sets `mobile_zip_url = null` and `mobile_zip_uploaded_at = null`
  6. Calls `onRefresh()` to reload
- In the expanded row details section (around line 662), when `metadataMap?.has(audit.id)` is true AND the user is admin/super_admin, show a "Delete Metadata" button with a Trash2 icon next to the Mobile Zip File row
- The button shows a confirmation dialog before proceeding

---

### Technical Summary

| File | Changes |
|------|---------|
| `src/pages/Index.tsx` | Remove metadata ID fetch for "Ready for Review" filter (use `mobile_zip_url` check instead); add client-side sorting for "Awaiting Review" filter |
| `src/components/AuditTable.tsx` | Add `handleDeleteMetadata` function and "Delete Metadata" button for admin/super_admin when metadata exists |

