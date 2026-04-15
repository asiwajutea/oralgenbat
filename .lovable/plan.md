

## Plan: Fix Burn Queue Table — Phone Number, Sticky Actions, and FM Filter

### Problem Summary

1. **No phone number column** — `interviewee_phone` exists in `interview_metadata` but isn't fetched or displayed.
2. **Action menu (3-dots) not sticky** — When scrolling horizontally, the action column scrolls away.
3. **FM filter shows duplicate/inconsistent names** — The filter reads `field_manager` from `interview_metadata` which has free-text entries with inconsistent casing (e.g., "Isaac pamilerin", "Oluwatoyin ojo" vs "Oluwatoyin  ojo"). There are 24 distinct strings but only 9 actual field managers in the system.
4. **No "Not Assigned" option** — Interviews without a field manager value have no filter option.

### Changes — `src/pages/BurnQueue.tsx`

**1. Fetch `interviewee_phone` in metadata query (line ~133)**

Add `interviewee_phone` to the select:
```typescript
.select("audit_id, total_names, field_manager, interviewee_phone")
```

**2. Add Phone column to desktop table**

Insert a new `<TableHead>Phone</TableHead>` column after File Name, and render `meta?.interviewee_phone || "-"` in the corresponding cell. Also add it to the mobile accordion view.

**3. Make action column sticky**

Add `sticky right-0 bg-background` classes to the last `<TableHead>` and last `<TableCell>` so the 3-dot menu stays visible during horizontal scroll.

**4. Fix FM filter to use canonical list from `profiles` + `user_roles`**

Replace the current approach (deriving FM names from free-text `interview_metadata.field_manager`) with a query against `profiles` joined with `user_roles` where `role = 'field_manager'`. This gives the real list of 9 FMs. Add a "Not Assigned" option.

**5. Handle "Not Assigned" FM filter**

When `fmFilter === "not_assigned"`, filter items where `meta?.field_manager` is null/empty. When filtering by a specific FM name, use case-insensitive matching (`toLowerCase().includes()`) to handle the inconsistent casing in the metadata.

**6. Update FM analytics breakdown**

Apply the same case-insensitive grouping in the FM breakdown collapsible, so "Isaac pamilerin" and similar variants are merged.

### Files Modified

| File | Change |
|------|--------|
| `src/pages/BurnQueue.tsx` | All 6 changes above |

No database changes needed — `interviewee_phone` and the profiles/roles tables already exist.

