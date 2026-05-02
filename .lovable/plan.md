# Fix Pass/Fail Errors and Bulk Re-Audit Not Triggering

Both issues are regressions introduced by recent backend changes. Root causes are confirmed from Postgres error logs.

## Issue 1 — "Failed to update interview status" on Pass / Fail / Override

**Root cause (confirmed in DB logs):**
```
ERROR: invalid input value for enum audit_status: "Failed Audit"
```

The new chat trigger `queue_audit_chat_event` (added in the chat/inbox migration) compares `NEW.status = 'Failed Audit'`, but the actual enum values are:
`Pending`, `Audit Passed`, `Audit Failed`, `Awaiting Review`.

Because the literal `'Failed Audit'` is cast to the `audit_status` enum at parse/execute time, **every** update to `audits.status` (pass, fail, or override) raises an exception and the whole transaction rolls back — hence the toast "Failed to update interview status."

**Fix:** Migration to replace the trigger function with the correct enum value `'Audit Failed'` (and use it consistently for the chat-event payload). No application code change needed.

## Issue 2 — Bulk PDF re-audit upload does not move interviews to "Awaiting Review"

**Root cause (confirmed in DB logs):**
```
ERROR: column reference "interview_time" is ambiguous
```

`BulkPdfUploadDialog` updates `audits` to `status = 'Awaiting Review', is_re_audit = true`. That update fires downstream logic (and/or `BulkMetadataUploadDialog` invokes `process-mobile-zip`) which calls `public.detect_interview_fraud_flag`. That function declares an OUT column named `interview_time` and inside its `RETURN QUERY` selects `m.interview_time` — Postgres resolves `interview_time` ambiguously between the OUT parameter and the table column, so the RPC errors and the surrounding update is rolled back. The PDF lands in storage, but the audit row is never flipped, so the count stays the same.

**Fix:** Migration to rewrite `detect_interview_fraud_flag` so all internal references to the metadata column are fully qualified (`m.interview_time`) and the OUT column is renamed (e.g. `interview_time_out`) — or wrap the body so the OUT name doesn't collide. Signature change is internal; the only caller reads positional fields, but we'll preserve the returned column order and only rename the conflicting one. Frontends that read it by name will be checked and updated if needed.

## Implementation steps

1. **Migration: fix chat audit-failure trigger**
   - `CREATE OR REPLACE FUNCTION public.queue_audit_chat_event()` replacing both occurrences of `'Failed Audit'` with `'Audit Failed'`.
   - Keep the trigger definition (`AFTER INSERT OR UPDATE OF status ON public.audits`).

2. **Migration: fix `detect_interview_fraud_flag` ambiguity**
   - Rename the conflicting OUT parameter (`interview_time` → `interview_time_out`) and update the final `SELECT` accordingly, OR fully qualify every internal reference and alias the projected column. Verify all callers (`rg "detect_interview_fraud_flag"`) and update any client that reads `.interview_time` from the result.

3. **Verification (post-migration)**
   - Re-run "Fail Interview" on `NG71_738_20260416_1412` — expect success and a chat thread auto-created via `process-chat-events`.
   - Re-run a bulk PDF re-audit upload — expect rows to flip to `Awaiting Review`, `re_audit_count` to increment, and the tracking count to reflect the new total.
   - Check `postgres_logs` for any remaining `ERROR` entries.

## Files to change

- New migration `supabase/migrations/<timestamp>_fix_audit_status_and_fraud_rpc.sql`
- Possibly small edit in any TS file consuming `detect_interview_fraud_flag` if it reads `.interview_time` by name (will confirm during implementation).

## Out of scope

No UI changes, no chat/inbox feature changes, no FM-history changes — these two fixes alone resolve both reported errors.
