# Plan

## 1. Upload Center — pair PDF + metadata, preflight summary (IMPORTANT)

**File**: `src/pages/UploadCenter.tsx` (and reuse logic already in `BulkPdfUploadDialog`/`BulkMetadataUploadDialog` / `CombinedUploadDialog`).

Currently each file is rendered as its own row and uploaded independently. Change the **new-interview** flow (re-audit flow stays per-file because users replace one artifact at a time) so files are grouped by base name into one logical row.

### Group model

Introduce `interface Group { baseName; pdf?: File; zip?: File; ... }` derived from `rows` whenever the file picker changes:

- **Both PDF + ZIP present**: render one row labeled `NGXX_…  ·  Paired (PDF + Metadata)`. A single progress bar covers the whole pair. On run, upload PDF first, await success, then upload ZIP. If PDF fails, mark ZIP as `Skipped (PDF failed)`.
- **PDF only**: label `PDF only` (blue badge).
- **ZIP only**: do the existing `audits` lookup by `baseName`. If a matching PDF is found, label `Pair with existing PDF` and proceed. If not found, mark `Will skip — no PDF for this metadata` and exclude from the upload count.
- **Already uploaded** (audits row exists with same `file_name` in `new` mode, or duplicate metadata when ZIP & `mobile_zip_url` set): mark `Will skip — already uploaded` before upload starts.

This is the same logic CombinedUploadDialog already uses when ZIP+metadata are picked together — extract it into a shared helper `src/lib/groupUploadFiles.ts` and call it from `UploadCenter` and the dashboard/interviews upload dialogs so behaviour is uniform.

### Preflight summary modal

When the user clicks **Start upload**, intercept and open an `AlertDialog` "Ready to upload" listing:

- `X paired (PDF + metadata)`
- `Y PDF only`
- `Z metadata paired with existing PDF`
- `S will be skipped` with reasons (collapsible per file)

Buttons: **Cancel** / **Confirm & upload**. Only on confirm does the existing `start()` loop run, now driven by the grouped queue (sequential within a group, PDF first, then ZIP).

### Status label cleanup

Update the per-row badge logic in the file list to derive from the group (one row per group), not per file. Pending rows still removable via X.

## 2. Quick Re-Audit (IMPORTANT)

**File**: `src/components/review/QuickReAuditDecisionCard.tsx`.

- **Add Field Audit to artifact options** in both the same-reason and new-reason dialogs:
  ```tsx
  <Checkbox checked={artifacts.includes("field_audit")} … />
  <MapPin className="h-4 w-4" /> Field Audit
  ```
  Same checkbox added to `sameArtifacts`. The `re_audit_quick_fail` RPC already stores `_artifact_correction` as `text[]`, so no migration is needed — just allow the third value.
- **Previous checklist not showing**: the query `prevChecklist` reads `audit_checklist_progress`, but on quick re-audits the auditor never opens the full checklist so no progress row exists. Add a fallback chain identical to the one already wired into the standalone "Previous checklist" panel:
  1. Try `audit_checklist_progress` (most recent row).
  2. Fall back to `review_feedback_history.failed_checklist_items` (JSONB the trigger snapshots) for the latest cycle.
  3. As a final fallback, build items from `lastFeedback.review_comment` parsed by `parseChecklistFeedback()` so the auditor at least sees which question IDs failed.
  Render the union in the same `<Table>`. Keep the collapsible expanded by default when any items are found.

## 3. PDF report download — restore failure reason + action plan

The Tracking page PDF (`src/pages/InterviewTracking.tsx` lines 800-850) currently writes only `Status / FM / Names` and `Interviewee / Date / PDF / Meta`. Failure reason and action plan were dropped.

**InterviewTracking.tsx**: in the per-interview loop, when `interview.status === "Audit Failed"` (or `"Audit Passed - Pass with Failures"`), append:

```
Failure Reason: <review_comment>
Action Plan:    <action_plan>
```

Wrap with `doc.splitTextToSize(... , maxLineWidth)` and advance `y` accordingly with page-break handling matching the existing pattern.

**AdminReviewHistory.tsx**: review the PDF builder (lines 597-790). The Feedback/Action Plan blocks exist but are only emitted when `parseChecklistFeedback` returns items. Fix by **always** writing `Failure Reason: <review_comment>` and `Action Plan: <action_plan>` whenever status is failed or override, regardless of whether the checklist parser finds question IDs.

Same fix anywhere else that calls `jsPDF` to export per-audit rows (`ReviewHistory.tsx` if it has a PDF export). Audit `rg -n "jsPDF" src/pages` and apply the same fields.

## Out of scope

- Activity timeline, upload-lock exemptions, team approvals, chat policies (already covered earlier).
- Edge functions, RPC schema changes (none needed for the above).
