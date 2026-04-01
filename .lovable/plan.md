

## Plan: Burn Button Mobile Fix, Burn-Aware Exports/Stats, Tracking Export, Dropdown Actions, Performance Optimization

---

### 1. Fix Burn Button Not Showing on Mobile

**File: `src/pages/InterviewTracking.tsx`** (mobile accordion actions section, ~line 1248-1349)

The mobile accordion action buttons area does not include the "Send to Burn" button. The burn button only exists in the desktop table view (line 1555-1564).

**Fix:** Add the burn button to the mobile accordion action buttons section (after the Upload Metadata button, around line 1348), identical to the desktop version.

---

### 2. Exclude Burned Interviews from Admin Review History Exports

**File: `src/pages/AdminReviewHistory.tsx`**

The `exportToPDF`, `exportToCSV`, `exportToExcel`, and `downloadFilteredPDFs` functions (lines 434-846) all query audits directly without excluding burned audit IDs.

**Fix:** In each export function, add the same `.not("id", "in", ...)` filter using `burnedAuditIds` to exclude burned interviews from all exports.

---

### 3. Add "Sent to Burn" Stat Card to Tracking Page and Review History

**File: `src/pages/InterviewTracking.tsx`**

Add a new stat card (orange/flame themed) showing the count of burned interviews. The `burnedAuditIds` set already exists. The burned interviews should NOT be counted under "Failed" (they already aren't since they're filtered out by `nonBurnedInterviews`). Add a new card showing the burn count.

**File: `src/pages/AdminReviewHistory.tsx`**

Similarly add a "Sent to Burn" stat card. The `burnedAuditIds` array already exists. Show the count.

**File: `src/pages/ReviewHistory.tsx`**

Add burn count stat card. Need to fetch burned audit IDs here too.

---

### 4. Add Export Button to Tracking Page

**File: `src/pages/InterviewTracking.tsx`**

Currently only has "Export CSV". Add a dropdown Export button (like AdminReviewHistory) with CSV and PDF options. The PDF export will follow the same pattern as AdminReviewHistory's `exportToPDF` but scoped to the user's filtered interviews.

---

### 5. Convert Tracking Page Actions Column to Dropdown Menu

**File: `src/pages/InterviewTracking.tsx`**

**Desktop (lines 1453-1566):** Replace the `<div className="flex items-center gap-2">` containing multiple buttons with a `DropdownMenu`. The trigger will be a small "..." or kebab button. Menu items: View PDF, View Failed, Comment/Resolved, View Issue, Upload Metadata, Send to Burn.

**Mobile accordion (lines 1248-1349):** Similarly convert the `flex flex-wrap` action buttons into a DropdownMenu for consistency and space saving.

---

### 6. Performance: Optimize Slow Data Loading

The tracking page fetches ALL audits client-side in batches, then filters. This is inherently slow for large datasets.

**File: `src/pages/InterviewTracking.tsx`**

Key optimizations:
- **Move to server-side pagination**: Instead of fetching all audits and filtering client-side, use server-side `.range()` with filters applied at the query level. Use the existing `get_contractor_audits` RPC for contractor/auditor roles, and build equivalent server-side filtering for other roles.
- **Remove the `fetchAllAudits` loop** that fetches everything. Instead, apply search/status/field-manager filters directly in the Supabase query and use `.range()` for pagination.
- **Lazy-load comment counts**: Only fetch unread comment counts for the current page's audit IDs (not all audits).
- **Remove the separate burned audit IDs query**: Instead, add a `NOT EXISTS (SELECT 1 FROM burn_queue WHERE audit_id = audits.id AND restored_at IS NULL)` filter server-side via an RPC or a view.

**File: `src/pages/AdminReviewHistory.tsx`**

The main query already uses server-side pagination (good). The `stats` query fetches ALL reviewed audits via `fetchAllRows` which is slow.

**Fix:** Replace the stats query with a server-side count query:
```sql
-- Count by status in one query
SELECT status, COUNT(*), SUM(total_names) FROM audits 
JOIN interview_metadata ON ... 
WHERE reviewed_at IS NOT NULL GROUP BY status
```
Create a lightweight RPC `get_review_stats()` or use multiple `.select('id', { count: 'exact', head: true })` queries instead of fetching all rows.

**File: `src/pages/ReviewHistory.tsx`**

Already uses server-side pagination. No major changes needed.

**File: `src/hooks/useTeamAssignments.ts`**

The `useAssignments` hook fetches all assignments. If this is causing slow loads on the team assignments page, apply the same server-side pagination pattern.

---

### Technical Summary

| Area | File | Change |
|------|------|--------|
| Burn button mobile | `InterviewTracking.tsx` | Add burn button to mobile accordion actions |
| Burn-aware exports | `AdminReviewHistory.tsx` | Exclude burned IDs from all export functions |
| Burn stat cards | `InterviewTracking.tsx`, `AdminReviewHistory.tsx`, `ReviewHistory.tsx` | Add "Sent to Burn" count card |
| Export on tracking | `InterviewTracking.tsx` | Add PDF export dropdown alongside CSV |
| Dropdown actions | `InterviewTracking.tsx` | Convert actions column to dropdown menu (desktop + mobile) |
| Performance - Tracking | `InterviewTracking.tsx` | Server-side pagination + filtering instead of fetching all rows |
| Performance - Admin Review | `AdminReviewHistory.tsx` | Replace fetchAllRows stats with count-only queries |
| Performance - Assignments | `useTeamAssignments.ts` | Server-side pagination for assignments |
| DB migration | New RPC function | `get_tracking_stats` for server-side stat aggregation |

