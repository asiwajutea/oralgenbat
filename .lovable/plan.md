## Upload Center improvements

**File:** `src/pages/UploadCenter.tsx` and `src/lib/uploadInterviewFile.ts`

1. **Scrollable file list** — wrap the `<ul>` of selected files in a `max-h-[420px] overflow-y-auto` container (smaller on mobile, e.g. `max-h-[55vh]`) so the Start Upload button stays visible.

2. **Per-row remove (X) icon**
   - Show an X button on every row.
   - While the batch is running, only rows with `status === "pending"` (not yet started) can be removed — the X is hidden/disabled on `uploading`, `done`, `failed` rows.

3. **Concurrency = 5 worker pool**
   - Replace the current sequential `for` loop in `start()` with a 5-worker pool: maintain an index pointer; each worker pulls the next `pending` row, runs `uploadInterviewFile`, then pulls the next. As soon as any worker finishes, it starts the next pending file — keeping up to 5 in flight at all times.
   - Removed rows are naturally skipped.

4. **Per-file upload percentage**
   - Extend `uploadInterviewFile` to accept an optional `onProgress: (pct: number) => void` callback.
   - Replace the `fetch` call in `uploadToBucket` with `XMLHttpRequest` so we can hook `xhr.upload.onprogress` and forward `(loaded/total)*100` to the callback. (Pattern already used in `UploadDialog.tsx`.)
   - In `UploadCenter`, store a `progress` number per row; render it next to each row (e.g. `45%` + a thin `Progress` bar) instead of the generic "Uploading…" text.
   - The overall progress bar at the top remains and shows completed-count / total.

5. **Mobile friendliness**
   - Stack header/meta vertically on small screens; ensure padding, font sizes, and the file list height work at ≤414px.
   - Make Start Upload button full-width on mobile (already mostly the case).
   - Ensure the row layout (icon + filename + % + X) doesn't overflow — truncate the filename and right-align controls in a flex row that wraps on very narrow widths.

## Re-Audit badge fix

**Root cause confirmed via DB query:** every interview re-uploaded through Upload Center has `is_re_audit = true` but `status = "Pending"`. The badge in `AuditTable.tsx` only renders when `status === "Awaiting Review" && is_re_audit`, so it never appears. The Failed-Interview-Modal path correctly sets `status: "Awaiting Review"`; Upload Center's `uploadInterviewFile.ts` sets `status: "Pending"`.

**Fix:**
- In `src/lib/uploadInterviewFile.ts`, for `mode === "re_audit"` change the `updatePayload.status` from `"Pending"` to `"Awaiting Review"` for both the PDF and ZIP branches.
- **Backfill:** update existing affected rows so the badge appears immediately:
  ```sql
  UPDATE audits
  SET status = 'Awaiting Review'
  WHERE is_re_audit = true
    AND re_audit_count > 0
    AND status = 'Pending';
  ```
  (Run via a one-off migration.)

## Out of scope
- No changes to other upload entry points, edge functions, or DB schema beyond the backfill.
- History tab, lock logic, and mode selector untouched.
