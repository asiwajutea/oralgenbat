# Fixes & enhancements

## 1. Quick Re-Audit Decision — relocate and improve

**File**: `src/components/review/AuditChecklist.tsx`, `src/pages/ReviewInterview.tsx`, `src/components/review/QuickReAuditDecisionCard.tsx`.

- **Relocate trigger**: Remove the standalone `QuickReAuditDecisionCard` card placed above the checklist. Pass a new optional prop `quickDecisionSlot?: ReactNode` into `AuditChecklist`. Render it inline next to the existing "Abandon" button (both sticky and non-sticky branches at lines 559 & 657). On `ReviewInterview.tsx` line 786, build the slot once (only when `audit.is_re_audit`) and pass it in instead of rendering the card separately.
- **Editable "same reason" failure**: Replace the read-only `<p>` summary in the "Fail — same reasons" `AlertDialog` (lines 264–314) with editable `<Textarea>` fields prefilled from `lastFeedback.review_comment` / `action_plan` and an editable artifact checkbox group prefilled from `lastFeedback.artifact_correction`. Auditor can refine the reason before confirming. Submission still flags `_reused_previous: true` if the auditor did not change anything substantive; otherwise mark `false`.
- **Show previous checklist properly**: The current "Previous checklist answers" collapsible only reads `audit_checklist_progress`. Many re-audits never had a saved progress row, so it shows empty. Fall back to the most recent `review_feedback_history.failed_checklist_items` (the JSONB the trigger snapshots on each failure) when `audit_checklist_progress` is empty, and render those rows in the same table. Expand the collapsible by default whenever items exist.

## 2. Pass-with-Override — inbox notification + Warn toggle

**Files**: `src/components/review/ReviewActions.tsx`, `supabase/migrations/<new>.sql`, `src/pages/Inbox.tsx`, `src/components/InboxBell.tsx`, optional `src/components/announcements/AnnouncementProvider.tsx` (or new `OverrideWarningNagModal.tsx`).

- **New "Warn" toggle** in the Pass-with-Override dialog: a `Switch` labeled "Warn the team about this agent's practice". When on, the failure context becomes a high-priority warning.
- **Migration**:
  - Extend `audits` with `pass_override_warn boolean default false`.
  - New table `override_warning_acks(id, audit_id, user_id, acked_at)` — tracks who has opened the inbox message so the nag modal can stop.
  - New SECURITY DEFINER RPC `notify_pass_override(_audit_id uuid, _warn boolean, _reason text)`:
    - Resolves interviewer → assigned FM (`team_assignments`), FM → contractor admin (`fm_contractor_assignments`), contractor → sub-contractor (`fm_sub_contractor_assignments`).
    - For each recipient (FM, contractor, sub-contractor): finds-or-creates a `direct` (or new `category = 'override_notice'`) conversation pinned to the audit and inserts a `messages` row with body = override reason and `metadata = { kind: 'pass_override', audit_id, warn: bool, file_name }`. If `warn`, set `metadata.priority = 'high'` and pin the conversation (`conversations.is_pinned = true`).
  - Add `'override_notice'` to whatever check constraint or enum the inbox category uses; if `is_pinned` doesn't exist on `conversations`, add it.
- **Wire it up**: After the successful update in `ReviewActions.tsx` line 599, call `supabase.rpc('notify_pass_override', …)` with the warn flag.
- **Inbox UI** (`Inbox.tsx`):
  - Add the `override_notice` entry to `CATEGORY_META` with `AlertTriangle` icon.
  - In the conversation list, when `latest message.metadata.kind === 'pass_override' && metadata.warn`, prefix the row with a red `AlertTriangle` icon and sort it to the top.
- **Nag modal**: New `src/components/inbox/OverrideWarningNagModal.tsx` mounted in `Layout.tsx`. On every route change / app load, query `messages` where `metadata.kind = 'pass_override'` and `metadata.warn = true`, joined against `override_warning_acks` filtered by current user — show a modal listing each un-acked warning ("Auditor X marked NGXX as Pass with Override – reason: …, open inbox"). The user must click "Open in inbox" which records an `override_warning_acks` row. Re-appears on next session until acked. Recipients = FM, contractor, sub-contractor only (use `has_role`).

## 3. Upload-lock exemption fix

**File**: `supabase/migrations/<new>.sql`.

`assert_upload_allowed` (current migration `20260504104215`) never consults `upload_lock_exemptions`, so exempt users still get blocked once they actually upload. Replace the global/contractor/FM/interviewer lock loop so it skips a lock when:

```
EXISTS (
  SELECT 1 FROM upload_lock_exemptions e
  WHERE e.scope_type = v_lock.scope_type
    AND COALESCE(e.scope_id, '') = COALESCE(v_lock.scope_id, '')
    AND (
      (e.exempt_user_id IS NOT NULL AND e.exempt_user_id = auth.uid())
      OR (e.exempt_role IS NOT NULL AND has_role(auth.uid(), e.exempt_role))
    )
)
```

(Match the actual column names in `upload_lock_exemptions` — adjust if schema differs.) The frontend hook `useUploadLockStatus` already calls `is_upload_allowed`, so no client change.

## 4. PDF compression dropping pages

**File**: `src/utils/compressPdf.ts`, `src/lib/uploadInterviewFile.ts`.

- Wrap each `page.render` in try/catch. If any page render fails, abort the whole quality loop for that pass and continue to the next quality level; if all quality levels fail or any pass produced fewer pages than `numPages`, **return the original file unchanged** instead of a truncated one.
- After producing the compressed `Blob`, re-open it with `pdfjs-dist` and assert `newDoc.numPages === numPages`. If mismatch, fall back to the original.
- In `uploadInterviewFile.ts` (line 117-119), surface a `toast.warning` when compression falls back so the operator knows the original was uploaded.

## 5. Team Approval — surface interviewers known only from audits

**File**: `src/pages/TeamApprovals.tsx` (the `unassignedInterviewers` query, lines 163-206).

Right now the query reads codes only from `interview_metadata`. Codes 684 and 687 have audits but no extracted metadata yet, so they never appear. Union with codes derived from `audits.file_name` (`split_part(file_name, '_', 3)` for contractor `split_part(file_name, '_', 2)`):

1. Fetch distinct `(file_name)` from `audits` (already scoped by contractor where applicable).
2. Parse `NGXX_<contractor>_<interviewer>_…` into `{ contractor_id, code }`.
3. Merge with the metadata-derived list (dedupe by code).
4. Subtract approved `team_assignments` codes as before.
5. For codes without a name, show "Unknown — derived from upload".

## 6. Chat Policies crash for super admin

**File**: `src/pages/ChatPolicies.tsx` line 186.

`typeof null === "object"`, so when `pickerOpen` is `null` the title computation tries to read `pickerOpen.blockedId` and throws "Cannot read properties of null (reading 'blockedId')". Replace:

```ts
: typeof pickerOpen === "object" ? `Allow these users …`
```

with an explicit non-null guard:

```ts
: (pickerOpen && typeof pickerOpen === "object" && pickerOpen.kind === "except")
    ? `Allow these users to message ${userName(pickerOpen.blockedId)}`
```

(Also tighten `currentSelection` on lines 164-171 with the same guard for safety.)

## Out of scope

- No changes to penalty/inbox layout/team-assignments work, the full checklist flow, or PDF/ZIP edge function parsing.
