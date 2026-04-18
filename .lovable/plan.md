## Upload Tracking Page — Add Interview List Breakdown

### Goal

Add a compact, expandable list of individual interviews below the existing summary stats and trend charts on `/upload-tracking`. Keep all existing summary/chart UI as-is.

### Data layer

Create a new RPC `get_upload_tracking_interviews` (read-only, SECURITY DEFINER, scoped to date range and pagination) that returns one row per audit with:


| Field                                          | Source                                |
| ---------------------------------------------- | ------------------------------------- |
| `audit_id`                                     | `audits.id`                           |
| `file_name` (folder name, no `.pdf`)           | `audits.file_name`                    |
| `uploaded_at`                                  | `audits.uploaded_at`                  |
| `status`                                       | `audits.status`                       |
| `is_re_audit`, `re_audit_count`                | `audits.*`                            |
| `artifact_correction` (array of artifact tags) | `audits.artifact_correction`          |
| `review_comment` (failure reason)              | `audits.review_comment`               |
| `action_plan`                                  | `audits.action_plan`                  |
| `passed_with_failures`                         | `audits.passed_with_failures`         |
| `interviewee_name` (informant)                 | `interview_metadata.interviewee_name` |
| `field_manager`                                | `interview_metadata.field_manager`    |
| `total_names`                                  | `interview_metadata.total_names`      |
| `total_count`                                  | window count for pagination           |


Args: `p_start_date`, `p_end_date`, `p_search` (optional folder name filter), `p_status` (optional), `p_limit`, `p_offset`. Excludes burned audits.

### New hook

`useUploadTrackingInterviews(startDate, endDate, page, pageSize, search, status)` in `src/hooks/useUploadTracking.ts`.

### UI changes — `src/pages/UploadTrackingDashboard.tsx`

Add a new "Interview Breakdown" `Card` after the existing "Detailed Breakdown" period table, containing:

1. **Compact toolbar** — search input (folder name), status filter dropdown, page size selector.
2. **Compact table** with columns:
  - Folder name (monospace, small)
  - Informant (interviewee name) — truncate with tooltip
  - Field Manager — truncate
  - Names — right-aligned number
  - Status — colored badge (green/red/amber/gray)
  - Re-audit — small "↻ ×N" badge only when `re_audit_count > 0`
  - Artifacts — small inline badges for each entry in `artifact_correction` (e.g. PDF, ZIP, Audio, Photos), only shown when present
  - Action — single icon button "View" that opens a popover/dialog with: failure reason (`review_comment`), action plan, override reason (if `passed_with_failures`)
3. Pagination bar (Prev / Next, current page indicator, total count). Default 25 rows/page.
4. Reuses the date range already selected at the top of the page (`startDate` / `endDate`), so the list always matches the active period.
5. Compact density: `text-xs`, `py-1.5` cells, single-line rows with truncation; mobile-friendly horizontal scroll.

### Files


| File                                                         | Change                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `supabase/migrations/<new>.sql`                              | Create `get_upload_tracking_interviews` RPC                              |
| `src/hooks/useUploadTracking.ts`                             | Add `useUploadTrackingInterviews` query hook                             |
| `src/components/upload-tracking/InterviewBreakdownTable.tsx` | New compact table + toolbar + failure-reason popover                     |
| `src/pages/UploadTrackingDashboard.tsx`                      | Mount the new component below existing breakdown, pass active date range |


Other considerations:  
1. Add the field manager, interviewers, location to the stat summary card.  
2. Although the design should be compact, however I want to be able to see the information at a glance and make decision on their performances.  
  
Out of scope

- No changes to existing summary cards, charts, or period table.
- No edits to global `audits` queries elsewhere.
- No CSV export in this round (can be added later if you want).

Approve and I'll build it.