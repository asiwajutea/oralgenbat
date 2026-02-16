

## Plan: Fix Storage Cleanup & UI Issues

### Problem Analysis

1. **Cleanup function times out**: The edge function processes all 404 audits sequentially in a single HTTP request. Each audit requires ~3-4 database calls (fetch audit, delete ZIP, delete photos, log cleanup). With 404 audits, this exceeds the edge function timeout limit, causing "Failed to fetch" error.

2. **No visual progress**: The current UI shows an indeterminate progress bar with no real feedback on how many audits have been processed.

3. **Storage card shows "of 1 GB"**: The card displays a hardcoded 1 GB limit which is incorrect for this project (actual usage is 12+ GB).

---

### Fix 1: Batch Processing with Progress Tracking

**Problem**: Single request with 404 audits times out.
**Solution**: Process audits in batches of 25 from the client side, updating a progress bar after each batch completes.

**File: `src/hooks/useCleanupAudits.ts`**
- Replace the single `mutateAsync` call with a batched approach
- Add a new hook `useBatchDeleteAuditFiles` that:
  - Splits `auditIds` into chunks of 25
  - Calls the edge function for each chunk sequentially
  - Tracks progress state: `{ processed: number, total: number, currentBatch: number, totalBatches: number, errors: string[] }`
  - Returns progress via a callback or state

**File: `src/components/analytics/StorageCleanupDialog.tsx`**
- Replace `useDeleteAuditFiles` with the new batch hook
- Show a real progress bar with percentage: e.g., "Processing batch 3 of 17... (75/404 audits)"
- Show running totals of ZIPs and photos deleted as batches complete
- Disable close/cancel while deletion is in progress

### Fix 2: Visual Progress Indicator

**File: `src/components/analytics/StorageCleanupDialog.tsx`** (confirmation view)
- Replace the indeterminate `<Progress value={undefined}>` with a determinate progress bar showing actual batch progress
- Add text showing: "Batch X of Y - Z/Total audits processed"
- Show cumulative results: "Deleted X ZIPs, Y photos so far..."
- After completion, show a summary before closing

### Fix 3: Storage Usage Card - Remove "of 1 GB" and Always Show Cleanup Button

**File: `src/components/analytics/StorageUsageCard.tsx`**
- Remove the "of {storage_limit_gb} GB" text and the percentage-based progress bar
- Just show the total size used (e.g., "12.28 GB") and file count
- Remove the `showWarning` conditional -- always show the "Cleanup Old Files" button
- Remove the warning alert wrapper; just render the button directly in the card content

---

### Technical Details

**Batch processing approach in `useCleanupAudits.ts`**:
```
function useBatchDeleteAuditFiles():
  state: { phase, processed, total, zipsDeleted, photosDeleted, errors }
  
  execute(auditIds, deleteZips, deletePhotos):
    chunks = splitIntoChunks(auditIds, 25)
    for each chunk:
      call edge function with chunk
      accumulate results
      update state (triggers re-render with new progress)
    invalidate queries on completion
```

**StorageCleanupDialog confirmation view changes**:
- During deletion: show determinate progress bar + batch counter + running totals
- After completion: show final summary with total ZIPs deleted, photos deleted, and errors if any
- Add a "Done" button that appears after completion to close the dialog

**StorageUsageCard changes**:
- Display: "12.28 GB" (large), "11518 files" (subtitle)
- Remove progress bar and percentage
- Always show "Cleanup Old Files" button below the stats

### Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useCleanupAudits.ts` | Add batched deletion hook with progress state |
| `src/components/analytics/StorageCleanupDialog.tsx` | Use batch hook, show real progress, show completion summary |
| `src/components/analytics/StorageUsageCard.tsx` | Remove "of 1 GB", remove progress bar, always show cleanup button |

