

## Plan: Fix Filter Sidebar Counts (1000-Row Limit)

### Problem
The `useStatusCounts` hook fetches all audits to count them client-side, but Supabase caps queries at 1,000 rows by default. With 1,372 audits in the database, 372 are silently dropped, causing all filter counts to be wrong (e.g., "Ready for Review" shows 11 instead of the actual 157).

### Solution
Paginate the fetch in `useStatusCounts.ts` using `.range()` batches (same approach already used on the Tracking page), ensuring all 1,372+ audits are counted.

### Technical Details

**File: `src/hooks/useStatusCounts.ts`**

Replace the single query (lines 44-56):
```typescript
const { data: audits, error } = await supabase
  .from("audits")
  .select(`...`);
```

With a paginated loop:
```typescript
const batchSize = 1000;
let allAudits: any[] = [];
let from = 0;
let hasMore = true;

while (hasMore) {
  const { data: batch, error } = await supabase
    .from("audits")
    .select(`
      status, locked_by, locked_at, is_re_audit,
      reviewed_by, file_url, file_name, mobile_zip_url,
      interview_metadata(total_names, contractor_id)
    `)
    .range(from, from + batchSize - 1);

  if (error) throw error;
  if (batch) allAudits = [...allAudits, ...batch];
  hasMore = batch?.length === batchSize;
  from += batchSize;
}
```

Then use `allAudits` in place of `audits` for the counting loop. No other logic changes needed -- the counting logic itself is correct, it just wasn't receiving all the data.

