

## Plan: Upload Tracking Dashboard

A new dedicated page at `/upload-tracking` that provides rich, interactive analytics on interview and name upload volumes over time. It will be accessible from the Analytics dropdown in the navigation.

---

### Data Model

No new tables needed. All data comes from existing tables:
- `audits.uploaded_at` — the original PDF upload timestamp (first upload only, so we use `uploaded_at` which is set once on creation)
- `interview_metadata.total_names` and `interview_metadata.audit_id` — names count per interview
- Interviews without metadata = PDFs uploaded but metadata not yet provided

### New Database RPC: `get_upload_tracking_stats`

A server-side function that accepts a time range and granularity, returning aggregated data:

```sql
CREATE FUNCTION get_upload_tracking_stats(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_granularity text -- 'day', 'week'
)
RETURNS TABLE (
  period text,
  period_start timestamptz,
  interviews_uploaded bigint,
  interviews_with_metadata bigint,
  interviews_without_metadata bigint,
  total_names bigint
)
```

Groups audits by `date_trunc(p_granularity, uploaded_at)`, left-joins `interview_metadata` to count which have metadata and sum `total_names`.

### New Hook: `src/hooks/useUploadTracking.ts`

- `useUploadTrackingSummary()` — fetches summary stats for today, this week, 13 weeks, 365 days
- `useUploadTrackingTrend(period, granularity)` — fetches trend data for charts

### New Page: `src/pages/UploadTrackingDashboard.tsx`

**Summary Cards (top row):**
- Today: interviews uploaded, total names
- This Week: interviews uploaded, total names
- Last 13 Weeks: interviews uploaded, total names
- Last 365 Days: interviews uploaded, total names

Each card shows interviews with/without metadata breakdown.

**Interactive Charts:**
- **Daily Upload Volume** (bar chart) — last 30 days, bars split by "with metadata" vs "without metadata"
- **Weekly Upload Trend** (line chart) — last 13 weeks showing interviews + names
- **Names per Period** (area chart) — cumulative or per-period names uploaded
- **Period Comparison** — side-by-side comparison of current vs previous period

**Data Table:**
- Sortable table showing per-period breakdown: period, interviews uploaded, with metadata count, without metadata count, total names
- Filterable by date range

**Period Selector:**
- Toggle between: Today, 7 Days, 13 Weeks, 365 Days
- Custom date range picker

### Navigation

**File: `src/App.tsx`**
- Add route `/upload-tracking` accessible to contractor, field_manager, admin, super_admin, sub_contractor

**File: `src/components/Header.tsx`**
- Add "Upload Tracking" to the Analytics dropdown menu

**File: `src/components/MobileNav.tsx`**
- Add "Upload Tracking" link under the Analytics section

---

### Technical Summary

| Area | Files | Change |
|------|-------|--------|
| DB function | New migration | `get_upload_tracking_stats` RPC |
| Hook | `src/hooks/useUploadTracking.ts` | Data fetching + summary logic |
| Page | `src/pages/UploadTrackingDashboard.tsx` | Full dashboard with charts, cards, table |
| Navigation | `App.tsx`, `Header.tsx`, `MobileNav.tsx` | Route + nav links |

