

## Plan: Fix Mark Resolved Visibility, Failed Count Discrepancy, Bulk PDF Download, Stat Counters, and Scrolling

### 1. Hide "Mark Resolved" for Passed and Ready-for-Review Interviews

Currently the Mark Resolved / Resolved button shows for ALL interviews unconditionally. We need to hide it when:
- Status is "Audit Passed"
- Status is "Awaiting Review" AND both PDF and metadata are uploaded

**Files to change:**
- `src/pages/InterviewTracking.tsx` (both mobile ~line 1093 and desktop ~line 1293): Wrap the Mark Resolved / Resolved button block in a condition:
  ```
  const showMarkResolved = interview.status !== "Audit Passed" && 
    !(interview.status === "Awaiting Review" && interview.has_pdf && interview.has_metadata);
  ```
- `src/pages/ReviewInterview.tsx` (~line 554-578): Same condition applied using `audit.status` and `metadata` presence.

### 2. Fix Failed Interview Count Discrepancy (97 vs 104)

The Interview Tracking page (97) applies role-based filtering -- it only shows interviews visible to the current user's role (e.g., scoped by contractor, field manager assignments). The Admin Review History page (104) shows ALL reviewed audits globally with no role filter.

**Root cause:** This is expected behavior for non-super-admin roles. However, if the user is a super_admin, the counts should match. The Interview Tracking query uses `.limit(5000)` which could also truncate results.

**Fix:** Increase the limit or remove it for super_admin, and ensure the Interview Tracking stats card for "Failed" matches the same data scope. No database change needed -- this is a data scope difference. I will add a note in the stats section clarifying "showing interviews within your access scope" for non-super-admin roles and verify the limit is not truncating data.

### 3. Bulk PDF Download on Admin Review History

Add a "Download PDFs" button that appears when a filter is active and the filtered results contain interviews with PDFs. When clicked, it fetches all `file_url` values for the filtered set and downloads them as a ZIP file using JSZip (already installed).

**File to change:** `src/pages/AdminReviewHistory.tsx`
- Add a `downloadFilteredPDFs` async function that:
  1. Fetches all audit IDs matching the current filter (not just the current page)
  2. Fetches their `file_url` values
  3. Downloads each PDF file
  4. Bundles them into a ZIP using JSZip
  5. Triggers browser download
- Add a "Download PDFs" button next to the Export dropdown, visible when `statusFilter !== "all"`.
- Show a loading spinner during download.

### 4. Stat Counters on Interview Tracking and Payment Pages

Add new stat cards showing:
- **Total assigned to data entry team** (interviews with a team assignment)
- **Total paid** (interviews with a payment record)
- **Assigned but not paid** (interviews with assignment but no payment)

**Files to change:**
- `src/pages/InterviewTracking.tsx`: Add 2 new stat cards after the existing grid. Query `interview_assignments` count and cross-reference with `interview_payments`. Since we already have `team_assigned` on each interview, we can compute from existing data. For payment info, add a small query or use the payment tracking hook.
- `src/pages/PaymentTracking.tsx`: Add stat cards above or alongside the existing `BudgetStatsCard`. Compute from the existing `records` data:
  - `assignedRecords.length` (assigned to clerks)
  - `records.filter(r => r.payment).length` (paid)
  - `records.filter(r => r.assignment && !r.payment).length` (assigned but not paid)

### 5. Fix ScrollArea Scrolling in ResolvedCommentsModal

The `ScrollArea` from Radix requires the viewport to have a constrained height. Currently `max-h-[300px]` on the `ScrollArea` root doesn't propagate to the viewport.

**File to change:** `src/components/tracking/ResolvedCommentsModal.tsx`
- Replace `<ScrollArea className="max-h-[300px] pr-2">` with a plain `div` that has `overflow-y-auto max-h-[300px]` styling, which reliably scrolls. The Radix ScrollArea component needs explicit height on the root, which conflicts with the flex layout.
- Alternative: Add `h-[300px]` (fixed height) instead of `max-h-[300px]` to the ScrollArea, since Radix ScrollArea needs a fixed height container.
- Keep the auto-scroll logic with `scrollRef`.

### Technical Summary

| File | Changes |
|------|---------|
| `src/pages/InterviewTracking.tsx` | Hide Mark Resolved for passed/ready interviews (mobile + desktop); add stat cards for assigned/paid/unpaid |
| `src/pages/ReviewInterview.tsx` | Hide Mark Resolved for passed/ready interviews |
| `src/pages/AdminReviewHistory.tsx` | Add bulk PDF download button with JSZip; verify failed count query |
| `src/pages/PaymentTracking.tsx` | Add stat cards for assigned/paid/assigned-but-unpaid |
| `src/components/tracking/ResolvedCommentsModal.tsx` | Fix ScrollArea to use a plain scrollable div with `overflow-y-auto max-h-[300px]` |
