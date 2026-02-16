

## Plan: Fix "Awaiting Review" Filter Failing for Large Contractor Datasets

### Root Cause

The user `lawala.wakeel@gmail.com` is an **auditor** with `contractor_id = NG71`. There are **1,171 NG71 audits** in the database. The current code in `src/pages/Index.tsx` builds an array of all matching audit IDs from two queries (interview_metadata + file_name prefix), then passes them to Supabase via `.in("id", contractorAuditIds)`. With ~1,171 UUIDs (each 36 characters), this creates a URL query string of ~42KB, which **exceeds PostgREST's URL length limit** and causes the request to fail silently.

### Solution

Replace the client-side ID collection approach with a **database RPC function** that performs the contractor-scoped filtering server-side, avoiding the URL length issue entirely.

### Changes

**1. Database Migration: Create an RPC function**

Create a function `get_contractor_audit_ids(p_contractor_id TEXT)` that returns audit IDs matching either:
- `interview_metadata.contractor_id = p_contractor_id`, OR
- `audits.file_name ILIKE p_contractor_id || '_%'`

This moves the filtering entirely to the database, returning only IDs needed for the current page.

Alternatively (simpler approach): Instead of collecting IDs first, restructure the main query to use a **two-step approach with batching** -- split the `.in()` call into chunks of 200 IDs and merge results. However, the RPC approach is cleaner.

**2. File: `src/pages/Index.tsx`**

Replace the contractor filtering section (lines ~99-131) that collects all IDs into `contractorAuditIds` with an RPC call:

```text
Current flow (broken):
  1. Fetch ALL matching audit IDs from interview_metadata (~1100+ rows)
  2. Fetch ALL matching audit IDs from audits by file_name (~1100+ rows)  
  3. Combine into array (~1171 UUIDs)
  4. Pass to .in("id", [...1171 UUIDs]) -- EXCEEDS URL LIMIT

New flow (fixed):
  1. Call RPC function that returns matching audit IDs server-side
  2. The RPC is used as a subquery filter in the main query
  -- OR --
  1. Use .rpc() to get paginated results directly with all filters applied
```

The simplest fix that avoids creating a new RPC: **batch the `.in()` call**. Split `contractorAuditIds` into chunks of 300 and run parallel queries, then merge. But this complicates pagination.

**Recommended approach**: Create a database function that accepts the contractor_id and status filters, and returns the paginated audit rows directly. This keeps the URL small and pagination accurate.

### Technical Details

**New RPC function** `get_contractor_audits`:
- Parameters: `p_contractor_id TEXT`, `p_statuses TEXT[]`, `p_search TEXT`, `p_reviewer TEXT`, `p_interviewer TEXT`, `p_start_date TIMESTAMPTZ`, `p_end_date TIMESTAMPTZ`, `p_limit INT`, `p_offset INT`, `p_sort_by_artifacts BOOLEAN`
- Logic: Query audits WHERE (id IN metadata match OR file_name ILIKE match), apply status/search/date filters, paginate, return results
- Returns: `SETOF audits` plus a count

**Frontend changes** in `src/pages/Index.tsx`:
- Replace the two-step fetch (collect IDs then query) with a single `.rpc('get_contractor_audits', {...})` call
- Keep all existing filter logic (status, search, date range, reviewer) but pass them as RPC parameters
- For non-contractor/auditor roles (admins), keep the existing direct query approach unchanged

### Files to Create/Modify

| File | Action |
|------|--------|
| Database migration (new RPC function) | Create |
| `src/pages/Index.tsx` | Modify - replace contractor ID collection with RPC call |

### What Stays the Same

- Filter sidebar UI and behavior
- Admin/super_admin query path (no contractor filtering needed)
- Pagination component
- Upload dialogs
- All other pages
