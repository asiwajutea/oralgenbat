# Upload Center — fix stuck uploads + add mode labels & summary

## Problem 1: Upload stuck at 0%, instant "Upload run finished"

**Root cause:** In `src/pages/UploadCenter.tsx` the worker reads the target row inside a `setRows(prev => ...)` updater and assigns it to an outer variable. React StrictMode runs functional updaters **twice** in dev. On the second pass the row is already `"uploading"`, so the outer `target` gets reassigned to that uploading snapshot. The subsequent guard `if (!target || target.status !== "pending") continue;` then skips the file. Every worker bails immediately → nothing uploads, progress stays at 0%, and `Promise.all` resolves so the success toast fires.

**Fix:** Don't capture state from inside an updater. Track claimed IDs in a plain `Set` (ref) outside React state, claim the ID before calling `setRows`, and use a pure updater that only transitions `pending → uploading`.

```ts
const claimed = new Set<string>();
const worker = async () => {
  while (true) {
    const id = getNextId();
    if (!id) return;
    if (claimed.has(id)) continue;
    claimed.add(id);

    // Read the file once from current state via a ref/snapshot
    const row = rowsRef.current.find(r => r.id === id);
    if (!row || row.status !== "pending") continue;

    setRows(prev => prev.map(x => x.id === id ? { ...x, status: "uploading", progress: 0 } : x));

    const outcome = await uploadInterviewFile({ file: row.file, mode, userId: user.id,
      onProgress: pct => setRows(prev => prev.map(x => x.id === id ? { ...x, progress: pct } : x)) });

    setRows(prev => prev.map(x => x.id === id ? {
      ...x, status: outcome.status === "success" ? "done" : "failed", progress: 100, outcome,
    } : x));
    done++; setCompleted(done);
  }
};
```

Add a `rowsRef` synced via `useEffect` so the worker always sees the latest file objects without re-reading via `setRows`.

## Problem 2: Show upload type per file + completion summary

### Per-row mode badge
Each row already knows the global `mode` (`new` or `re_audit`). For ZIPs, "re_audit" effectively means "Replace metadata"; for PDFs it means "Re-audit PDF". Show a small `Badge` next to the file name:

- `mode === "new"` → blue badge **"New interview"**
- `mode === "re_audit"` + PDF → amber badge **"Re-audit"**
- `mode === "re_audit"` + ZIP → amber badge **"Replace metadata"**

Place inline with the filename in the row (above the progress bar), responsive (wraps under filename on mobile).

### Post-run summary
Replace the generic `toast.success("Upload run finished")` with a summary toast and an inline summary card shown above the file list when `running === false && completed > 0`.

Aggregate counts from `rows` after the run:
- `success` — N succeeded
- `failed` — N failed
- `duplicate` — N skipped (already exists)
- `locked` / `quota_blocked` — N blocked

Toast (sonner):
```
toast.success(`Upload complete: ${ok} succeeded, ${failed} failed${dup ? `, ${dup} duplicate` : ""}`)
```
(use `toast.error` if `failed > 0 && ok === 0`).

Inline summary card (above the file list, dismissible with an X):
- Header: "Upload summary"
- Lines per category with icon + count
- For each row, the existing per-row outcome message already renders, so the card stays compact

## Files to change

- `src/pages/UploadCenter.tsx`
  - Add `rowsRef` synced from `rows`
  - Rewrite worker with `claimed` Set + pure updaters (fixes StrictMode bug)
  - Add mode badge in row markup
  - Add post-run summary state + card + summary toast

No backend, no DB, no edge-function changes. No changes to `uploadInterviewFile.ts`.

## Out of scope
- Other upload entry points (Combined, Bulk, FailedInterview modals) — they don't share this worker code.
- Changing the global mode picker per-file (still one mode per run).
