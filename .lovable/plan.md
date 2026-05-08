## 1. Lock-aware upload buttons everywhere

Wrap every existing "Upload" trigger in `<UploadLockGuard>`:
- `Header.tsx` (top-bar upload button)
- `Index.tsx` (Upload CTA)
- Home dashboards: `AdminDashboard`, `ContractorDashboard`, `SubContractorDashboard`, `FieldManagerDashboard`, `QAManagerDashboard`, `AuditorDashboard`
- `InterviewTracking.tsx` (single + bulk upload buttons)
- Bulk dialogs' open buttons: `BulkPdfUploadDialog`, `BulkZipUploadDialog`, `BulkMetadataUploadDialog`, `CombinedUploadDialog`, `UploadDialog`

For each trigger, pass the resolved scope (contractorId / fieldManagerId / interviewerCode if known; otherwise rely on `global` lock only). Show the inline amber banner via `showBanner` on the bigger CTAs (dashboards, Upload Center) and tooltip-only on icon buttons (header).

## 2. Upload Center polish

### Mobile responsiveness
- Convert mode toggle and "what files" group into a stacked column on `< sm` with full-width radios and 44px touch targets.
- Drop zone: switch to a vertical card list of files on mobile; horizontal table on `md+`. Status pill, kind chip, and per-row remove `X` stay visible.
- "History" tab table → reuses our standard mobile-accordion pattern (existing helper) so each row collapses on phones.
- Sticky bottom action bar on mobile with "Start upload" button.

### Duplicate detection (PDF and Metadata)
In `uploadInterviewFile.ts`:
- New mode flow already checks `audits` for an existing row by `file_name`. Extend it to also block when a metadata ZIP is being uploaded for an audit that already has `mobile_zip_url IS NOT NULL` → return `duplicate` with message "Metadata already uploaded for this interview. Use Re-audit to replace."
- Re-audit mode bypasses the duplicate guard (it is the replace path).

### Re-audit relabeling and broader replace support
- Allow re-audit replacement regardless of current status (today the helper already does — keep it). Update copy:
  - Mode labels: "New interview" / "Replace files (re-audit)".
  - Helper text under "Replace files": "Use this to upload a corrected PDF or metadata for an existing interview, whether or not it failed."
- Remove the "No existing interview to re-audit" wording → "No matching interview found for this file name."

### Navigation
- Move the "Upload Center" entry under the **Operations** group in `Header.tsx` and `MobileNav.tsx` (currently sits at the top level). Keep the same route `/upload-center` and icon.

## 3. Penalty Charges UX

### Scope ID picker
In `EditPenaltySettingDialog` (inside `PenaltyAdmin.tsx`), replace the free-text `scope_id` input with a Combobox/search:
- When `scope_type = 'contractor'` → search contractors from `contractors` table (label = name, value = contractor_id).
- When `scope_type = 'sub_contractor'` → search profiles where role = 'sub_contractor' (label = full_name + email, value = user_id).
- When `scope_type = 'global'` → hide the field.
Mirrors the existing exemption user-search component for visual consistency.

### Explain "cascade to subordinates"
- Add an inline help icon + tooltip next to the cascade toggle: "Also exempt every Field Manager under this Sub-Contractor. Example: a Sub-Contractor is on agreed leave; toggling cascade ON means every FM under them is also skipped from this penalty for as long as the exemption is active."
- Add the same wording to the dialog's description block so the user sees it without hovering.

## 4. Review page — pass/fail failure (and console capture)

### Root cause
The new penalty trigger function compares against the wrong enum literal:

```sql
IF NEW.status <> 'Failed' THEN RETURN NEW; END IF;
IF OLD.status = 'Failed' THEN RETURN NEW; END IF;
```

`audits.status` is the enum `audit_status` whose values are `Pending`, `Audit Passed`, `Audit Failed`. Postgres tries to coerce `'Failed'` into the enum and raises `invalid input value for enum audit_status: "Failed"`, which aborts every UPDATE on `audits`. That's why both Pass and Fail throw "Failed to update interview status," and any other page that updates `audits.status` (re-audit submissions, Mark Resolved, Send to Burn restore, override workflow, bulk re-uploads) is also blocked.

### Fix
New migration that replaces `raise_penalty_charges_on_failure` with the correct comparisons:
```sql
IF NEW.status <> 'Audit Failed'::audit_status THEN RETURN NEW; END IF;
IF OLD.status = 'Audit Failed'::audit_status THEN RETURN NEW; END IF;
```
No app code changes needed — the trigger is server-side. After deploy, Pass and Fail work again everywhere.

### Audit of other affected pages (no code changes needed once trigger is fixed, but verified)
- `ReviewActions.tsx` — Pass / Fail / Override
- `ReAuditDialog.tsx` — re-audit submission resets status to Pending
- `MarkResolvedDialog.tsx` — sets Audit Passed
- `SendToBurnDialog.tsx` — status changes
- Bulk PDF/ZIP re-audit flows in `uploadInterviewFile.ts`
All call `audits.update({ status })` and were silently failing for the same reason.

### Why the Error Console missed it
`useGlobalErrorCapture` only listens for `window.onerror` and `unhandledrejection`. The Supabase update result is awaited inside a `try/catch` that swallows the error after showing a toast — the promise never rejects to the global handler, so nothing reaches the console pipeline.

Fix: in `useGlobalErrorCapture.ts`, add a thin Supabase response interceptor that logs any `{ error }` returned from `from('...').update/insert/delete/upsert/rpc` calls into the same error pipeline (same shape: message, stack from `new Error().stack`, route, user). Concretely we'll wrap the shared client in a small `logSupabaseError(error, context)` helper and call it from a project-wide `withSupabaseLogging` utility used by `ReviewActions`, `ReAuditDialog`, `MarkResolvedDialog`, `SendToBurnDialog`, and `uploadInterviewFile`. New, swallowed DB errors will now appear in `/admin/error-console`.

## Out of scope
- Any change to the existing penalty business rules (charge mode, effective date, payment flow).
- Re-architecting upload flows — only labels, duplicate guards, and lock-aware wrappers change.
- Backfilling penalty charges for failures that were blocked while the trigger was broken (we can do this in a follow-up if you want).
