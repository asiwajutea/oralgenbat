## Goal
Fix Upload Center badges and summary on the re-audit replace flow.

## Changes (all in `src/pages/UploadCenter.tsx`)

### 1. Correct badge per file (based on existing audit status)
Today, in `re_audit` mode every PDF shows "Re-audit" and every ZIP shows "Replace metadata". The label should instead depend on whether the existing interview actually **failed an audit**:

- Existing audit `status === "Failed"` → amber **"Re-audit"** badge
- Existing audit in any other state (Pending, Awaiting Review, etc.) → blue **"Replace PDF"** (for `.pdf`) or **"Replace metadata"** (for `.zip`)
- `mode === "new"` → unchanged blue **"New interview"** badge

Implementation:
- When files are added via `onPick`, batch-query `audits` for matching `file_name` (base names) and store the discovered `status` on each row (`existingStatus?: string | null`).
- The badge in the list row uses `existingStatus` to choose between "Re-audit" vs "Replace …".
- Show a tiny "Checking…" placeholder until the lookup resolves (only a sub-second flash; non-blocking for upload).

### 2. Fix off-by-one summary (shows 7 of 8, or 0 of 1)
Root cause: after `Promise.all(workers)`, we read `rowsRef.current` to compute the summary, but the **last** `setRows` updates that set `outcome` haven't flushed yet (React batches state, and `rowsRef` is synced via `useEffect` after commit). So the most recently completed file is still missing its `outcome`.

Fix:
- Maintain a local `outcomes` Map (id → `UploadOutcome`) inside `start()`, updated synchronously inside the worker right after `uploadInterviewFile` resolves.
- Compute the summary from this Map (not from `rowsRef.current`). State updates remain for the UI; the summary calculation no longer depends on React commit timing.

### 3. New summary format
Replace the current `"Upload summary / 7 succeeded …"` block and the toast text with:

```
8 uploaded successfully. 5 replace, 2 re-audit.
```

Counting rules (only successes count toward the split):
- `re-audit` = successful rows where existing audit had `status === "Failed"`
- `replace` = successful rows in `re_audit` mode where existing audit was NOT failed (Replace PDF / Replace metadata)
- For `mode === "new"` runs, omit the split: `"8 uploaded successfully."`

Also append a tail when applicable: `" 1 failed."`, `" 2 duplicate."`, `" 1 blocked."` — keeping the same single-line feel.

Toast text matches the summary card text exactly.

## Out of scope
- No backend, RLS, edge-function, or `uploadInterviewFile.ts` changes.
- No changes to other upload entry points or the History tab.
