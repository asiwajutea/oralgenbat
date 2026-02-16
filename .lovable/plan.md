

## Plan: Fix Analytics Page Issues

### 1. Fix Cleanup Dialog - Ambiguous Column Bug

**Problem**: The `get_cleanable_audit_files` RPC function has an ambiguous `audit_id` column reference. The subquery for `interview_photos` uses `audit_id` in the JOIN condition `p.audit_id = a.id`, but the return table also defines `audit_id` as an output column, creating ambiguity.

**Fix**: Recreate the RPC function with fully qualified column references (e.g., `p.audit_id` in the subquery join).

### 2. Add Shorter Minimum Age Options to Cleanup Dialog

**Problem**: Currently only 30/60/90/180 day options exist. User wants 24 hours, 5 days, and 15 days added.

**Changes**:
- **`src/components/analytics/StorageCleanupDialog.tsx`**: Add `SelectItem` entries for 1 day, 5 days, and 15 days. Set default to 1 day.
- **Database function**: Update the RPC to also remove the `m.id IS NOT NULL` requirement (so files without metadata can also be cleaned) and lower the minimum enforced age.
- **Edge function** (`cleanup-audit-files/index.ts`): Lower the safety check from 30 days to allow cleaning files as young as 1 day old.

### 3. Add "Audited Today" Count to Auditors Tab

**Problem**: The Auditors tab table doesn't show how many interviews each auditor reviewed today.

**Changes**:
- **`src/hooks/useAnalytics.ts`**: Add `reviews_today` to the `AuditorPerformance` interface and compute it by filtering reviews where `reviewed_at >= startOfDay(now)`.
- **`src/components/analytics/AuditorPerformanceTable.tsx`**: Add a "Today" column displaying the count.

### 4. Fix Field Managers Tab

**Problem**: The Field Managers tab data relies on joining `team_assignments` with `profiles` via a foreign key on `field_manager_id`. The query uses `profiles!inner(full_name)` which requires the foreign key relationship to work. If the query hits the 1,000-row default limit, some field managers may be missing.

**Changes**:
- **`src/hooks/useAnalytics.ts`**: The `useFieldManagerPerformance` hook fetches `team_assignments` and `interview_metadata` separately. Both queries may hit the 1,000-row limit. Use paginated fetching (the existing `fetchAllRows` utility) for both queries to ensure all data is retrieved.

### Files to Modify

| File | Change |
|------|--------|
| Database migration (new) | Fix `get_cleanable_audit_files` RPC - qualify ambiguous column references, remove metadata requirement, allow lower min age |
| `src/components/analytics/StorageCleanupDialog.tsx` | Add 1-day, 5-day, 15-day options; update default; update description text |
| `src/hooks/useAnalytics.ts` | Add `reviews_today` to AuditorPerformance; use paginated fetch for FM queries |
| `src/components/analytics/AuditorPerformanceTable.tsx` | Add "Today" column |
| `supabase/functions/cleanup-audit-files/index.ts` | Lower minimum age safety check from 30 days to 1 day |

