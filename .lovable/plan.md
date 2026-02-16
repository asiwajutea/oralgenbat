## Plan: Show Filtered Total Names on Stat Cards

### What This Does

When any filter is active (e.g., contractor NG71), each stat card (Total, Passed, Failed, Unresolved Issues, No Metadata, Filtered) will show the filtered total names count and interviews count in brackets below the overall stat -- so users can see at a glance how many names belong to the filtered subset.

### Changes

**File: `src/pages/InterviewTracking.tsx**`

1. **Expand `nameStats` memo** (lines 553-568) to also compute filtered counts per category:
  - `filteredTotal` - sum of total_names from `filteredInterviews`
  - `filteredPassed` - sum from filtered interviews with status "Audit Passed"
  - `filteredFailed` - sum from filtered interviews with status "Audit Failed"
  - `filteredUnresolved` - sum from filtered interviews flagged with unresolved issues
  - `filteredNoMetadata` - sum from filtered interviews without metadata
2. **Update each stat card** (lines 893-971) to show filtered names in brackets when any filter is active:
  - **Total card**: Below "X names", show `(Y names)` where Y = filtered total names
  - **Passed card**: Below "X names", show `(Y names)`
  - **Failed card**: Below "X names", show `(Y names)`
  - **Unresolved Issues card**: Add the filtered names count (currently has no names line)
  - **No Metadata card**: Add the filtered names count (currently has no names line)
  - **Filtered card**: Already shows filtered names, no change needed
   The bracketed count only appears when `hasActiveFilters` is true and the filtered count differs from the overall count.

### Visual Result

Before (no filter):

```
Total         Passed        Failed
1372          989           182
144,849 names 109,584 names 19,939 names
```

After (with NG71 filter active):

```
Total         Passed        Failed        Unresolved Issues  No Metadata
1372 (782)    989 (700)     182 (82)      28 (8)             65 (15)
144,849 names 109,584 names 19,939 names
(52,311 names)(38,200 names)(8,100 names) (1,200 names)      (3,500 names)
```

### Technical Details

- No new queries needed -- all data is already in memory via `interviewsWithUnreadCounts` and `filteredInterviews`
- The filtered name counts are computed in the existing `nameStats` useMemo by adding filter-aware calculations
- Bracketed text uses a smaller font size and muted color to distinguish from the main stat
- The bracket line is conditionally rendered only when `hasActiveFilters` is truthy