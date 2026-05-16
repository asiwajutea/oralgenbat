## Root cause

The Upload Center re-audit path is broken in one specific spot: `src/lib/uploadInterviewFile.ts` invokes the `process-mobile-zip` edge function **without** the `mobileZipUrl` argument:

```ts
supabase.functions.invoke("process-mobile-zip", { body: { auditId: existing.id } })
```

But the edge function (`supabase/functions/process-mobile-zip/index.ts` line 26) requires **both** `auditId` and `mobileZipUrl` and throws "Missing required parameters" otherwise. Every other caller in the app (Combined upload, Bulk Zip, Bulk Metadata, Failed Interview modal, MobileZipUpload, AuditTable, InterviewTracking) correctly passes both. Only the Upload Center call is missing it.

Result for re-audit ZIPs uploaded via Upload Center:
- The new ZIP gets stored and `mobile_zip_url` is updated, so the audit appears as "Awaiting Review" again.
- The edge function call fails immediately, so old `interview_metadata` and `interview_photos` rows are never deleted and the new ones are never parsed.
- The review page therefore still shows the old metadata, and the auditor can't see the corrected data. That explains issues #2 and #3.

Issue #1 (showing "Awaiting Review" instead of "Re-Audit Required" badge): the badge in `AuditTable.tsx` requires `status === "Awaiting Review" && is_re_audit === true`. The upload code does set `is_re_audit: true`, so for any interview whose re-upload succeeded the badge should be red. The orange ones in the screenshot are almost certainly the same broken-reparse interviews where `is_re_audit` was set but they look like "fresh" awaiting-review items — we'll confirm by querying and the backfill will repair them either way.

## Changes

### 1. Fix the missing argument (1-line bug)

`src/lib/uploadInterviewFile.ts` — pass `mobileZipUrl` when invoking the parser:

```ts
supabase.functions.invoke("process-mobile-zip", {
  body: { auditId: existing.id, mobileZipUrl: publicUrl }
}).catch(() => {});
```

Applies to both the `new` ZIP path and the `re_audit` ZIP path (single shared block at the bottom of the file).

### 2. Backfill all affected interviews

For every audit that:
- has `mobile_zip_url IS NOT NULL`
- is currently `Awaiting Review`, `Pending`, or `Ready for Review` (i.e. not yet audited)
- AND whose `interview_metadata.updated_at` is older than `mobile_zip_uploaded_at` (stale parse), OR has no `interview_metadata` row at all

…re-invoke `process-mobile-zip` with the correct `mobileZipUrl`. Done as a one-shot script run from chat that:

1. Queries the affected rows via `supabase--read_query`.
2. Calls the edge function in batches (concurrency ~3) so we don't overwhelm it.
3. Reports a summary (succeeded / failed / skipped) back in chat.

No schema migration is needed — we're only triggering reparses against existing data.

### 3. Verify the re-audit badge after backfill

After step 2 finishes, re-query a few of the previously-orange interviews to confirm `is_re_audit = true` is set and the badge now renders red ("Re-Audit Required"). If any are still false but were truly re-uploaded, we'll patch their `is_re_audit` flag from the upload_attempts log (mode = `re_audit`, latest successful attempt per audit).

## Out of scope

- No UI/component refactors — the fix is one argument plus a backfill.
- No changes to other upload entry points (they're already correct).
- No changes to the edge function itself.

## Files touched

- `src/lib/uploadInterviewFile.ts` (one line)
- One-shot backfill executed from chat (no committed script)
