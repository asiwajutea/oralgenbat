

## Plan: Pass-with-Override Visibility, Burn Queue Overhaul, Total Names on Tracking, Field Audit API Fix

This plan addresses 4 areas across many files.

---

### 1. Show "Passed with Override" Indicator on Tracking + Admin Review + Index Pages

**Problem:** The `passed_with_failures` flag is stored in DB but never fetched or displayed outside the review page.

**File: `src/pages/InterviewTracking.tsx`**
- Add `passed_with_failures`, `pass_override_reason`, `pass_override_action_plan` to the `TrackingInterview` interface
- Add these fields to the audit SELECT query (line ~297)
- Map them in the results transformation (line ~389)
- Update `getStatusBadge`: when `status === "Audit Passed"` and `passed_with_failures` is true, show an amber `⚠` indicator next to the green "Passed" badge
- Wrap the amber indicator in a `Tooltip` showing the override reason on hover/click
- Add a `Popover` or dialog for viewing full reason + action plan on click

**File: `src/pages/AdminReviewHistory.tsx`**
- Add `passed_with_failures`, `pass_override_reason`, `pass_override_action_plan` to the `ReviewedAudit` interface
- Add these fields to the audit SELECT query
- In the status badge rendering, show amber `⚠` indicator for overridden passes with tooltip showing reason
- In PDF export, append "[PASSED WITH OVERRIDE]" marker and the reason

**File: `src/pages/ReviewHistory.tsx`**
- Same pattern: fetch `passed_with_failures` and show indicator

**File: `src/pages/ReviewInterview.tsx`** (completion page)
- On the completion screen (line ~537-590), if `audit.passed_with_failures`, show note "Passed with override" below the result heading

**File: `src/pages/Index.tsx`** (main interviews page)
- If interview data includes `passed_with_failures`, show the same amber indicator next to status

---

### 2. Add Total Names for Burned Interviews on Tracking Page

**File: `src/pages/InterviewTracking.tsx`**
- In the `burnedAuditData` query (line ~448), also fetch the audit IDs' `interview_metadata.total_names` by joining or running a secondary query
- Compute `burnedTotalNames` sum
- Display it under the "Sent to Burn" stat card as `{burnedTotalNames.toLocaleString()} names`
- Scope by user's contractor prefix (same as scopedCount logic)

---

### 3. Burn Queue Page Overhaul

**File: `src/pages/BurnQueue.tsx`** — Major rewrite

**a) Change BURN_DAYS from 190 to 90**
- Update constant and all references including `cleanup-burn-queue` edge function

**b) Mobile optimization**
- Use accordion/card layout for mobile (same pattern as InterviewTracking)
- Responsive stat cards and filters

**c) Stat cards**
- Total burned interviews count
- Total names (join with `interview_metadata` to get `total_names`)
- Total unique field managers (extract from `interview_metadata.field_manager`)
- Average days remaining

**d) Advanced filtering**
- Sort by clicking column headers (file_name, sent_at, days_remaining)
- Filter by field manager (dropdown populated from metadata)
- Filter by date range (sent_at)
- Search bar styled like tracking page (persistent, with clear button)

**e) Field Manager analytics section**
- Collapsible section showing per-field-manager breakdown: FM name, interview count, total names
- Displayed as a small table or cards

**f) Bulk actions**
- Checkbox selection on each row + "Select All" header checkbox
- Bulk Restore button (for admins)
- Bulk Permanent Delete button (for admins, with confirmation dialog)
- Both mutations update all selected items

**g) Actions column → DropdownMenu**
- Replace the inline Restore button with a kebab dropdown menu containing:
  - "View Details" — opens FailedInterviewModal with the audit's failure info (fetches from `audits` table)
  - "Restore" (admin only)
  - "Delete Permanently" (admin only, with confirmation)

**h) PDF report download**
- "Export PDF" button that generates a report following AdminReviewHistory template
- Includes: File Name, Sent By, Reason, Sent At, Days Remaining, Field Manager
- Follows active filters (status, search, date range, FM filter)
- Uses jsPDF with same styling as AdminReviewHistory export

---

### 4. Field Audit API Fix

**File: `supabase/functions/check-field-audit/index.ts`**
- The issue is in the upstream `get-field-audit` function on the AVTool project which likely filters by `status = 'completed'`
- Since we can't modify the external function, update `check-field-audit` to pass an additional parameter `{ folder_name, include_all_statuses: true }` in the body
- If the upstream function doesn't support this parameter, we need to modify the approach: instead of calling `get-field-audit`, call the AVTool's Supabase API directly to check if the folder exists in their `interviews` table regardless of status
- Add a direct query approach: use the AVTool URL + API key to query their database table directly via REST API: `GET ${avtoolUrl}/rest/v1/interviews?folder_name=eq.${folder_name}&select=id,folder_name,status` with the API key as Bearer token
- If any row is returned (regardless of status), return `{ found: true }` with the status info

---

### 5. Edge Function: Update Burn Days

**File: `supabase/functions/cleanup-burn-queue/index.ts`**
- Change `cutoffDate.setDate(cutoffDate.getDate() - 190)` to `- 90`

---

### Technical Summary

| Area | Files | Change |
|------|-------|--------|
| Override visibility | `InterviewTracking.tsx`, `AdminReviewHistory.tsx`, `ReviewHistory.tsx`, `ReviewInterview.tsx`, `Index.tsx` | Fetch + display `passed_with_failures` with amber indicator and tooltip |
| Burn total names | `InterviewTracking.tsx` | Join metadata to get names sum for burned interviews |
| Burn Queue overhaul | `BurnQueue.tsx` | Stats, FM analytics, bulk actions, dropdown actions, filters, PDF export, mobile layout, 90-day change |
| Field audit API | `check-field-audit/index.ts` | Query AVTool DB directly for folder existence regardless of status |
| Burn days | `cleanup-burn-queue/index.ts`, `BurnQueue.tsx` | 190 → 90 days |

