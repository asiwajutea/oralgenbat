# Plan

## 1. Inbox scoping (failed-audit notifications)

**Files**: `src/components/review/ReviewActions.tsx` (where `notify_pass_override` / failure notifications are dispatched), the existing `notify_pass_override` RPC, and the chat/notification side that posts the inbox conversation on audit fail.

Currently failure notifications go broadly. Add a server-side recipient resolver that, given an `audit_id`, returns the hierarchy:

- **Field Manager** assigned to the interviewer (via `team_assignments` / `interview_fm_overrides`)
- **Sub-contractor** assigned to that FM
- **Contractor** assigned to that sub-contractor
- **Admin(s)** assigned to that contractor (via `field_manager_admin_assignments` / contractor→admin mapping)

Create RPC `resolve_audit_notification_recipients(_audit_id uuid)` returning `(user_id, role, level)`.

Then update the audit-fail and override notification paths to:

- Build one conversation/inbox thread per recipient (or a single thread with all participants — match existing pattern).
- **FM payload**: full body (current behaviour — checklist failures, comment, action plan, links).
- **Sub-contractor / Contractor / Admin payload**: short summary only — `"Audit failed: {file_name} · Agent {interviewer_code} · FM {fm_name}"` with one-line failure reason and a deep link to the review page. Use a new `metadata.summary_only = true` flag so the inbox renderer can collapse the body.

Update `src/pages/Inbox.tsx` / message rendering to honour `summary_only` (just truncate body + hide checklist block).

## 2. Analytics dashboard — Age group chart (IMPORTANT)

**File**: `src/pages/AnalyticsDashboard.tsx` (Overview tab), new component `src/components/analytics/AgeGroupChart.tsx`.

Source: `interview_metadata.interviewee_age` (integer, already in DB).

Buckets:

- `Under 40`
- `40–54`
- `55–64`
- `65–74`
- `75–84`
- `85+`
- `Unknown` (null/0)

Implementation:

- Add hook in `useAnalytics.ts` that fetches counts via an RPC `get_interview_age_distribution(_scope...)` (so we don't pull every row). Honour the same role scope used elsewhere (full access / contractor / FM / interviewer).
- Render with Recharts: horizontal stacked bar OR a colourful donut + side legend showing count and %. Use existing semantic tokens (`--primary`, `--accent`, chart palette in `tailwind.config.ts`). Animated entry, hover tooltip with absolute + percentage.
- Place in Overview tab alongside existing summary cards as a full-width card "Interviewee Age Distribution".

## 3. Persistent pagination (IMPORTANT)

**File**: `src/components/AuditPagination.tsx` + every page that renders it.

Introduce a small hook `src/hooks/usePersistentPageSize.ts`:

```ts
usePersistentPageSize(key: string, defaultSize = 10): [number, (n:number)=>void]
```

Backed by `localStorage` (key prefix `lovable:pageSize:`) with cross-tab sync via `storage` event and an in-memory fallback. The user's last chosen page size persists across sessions per-table.

Refactor every consumer to use it instead of `useState(10)`:

- `src/pages/InterviewTracking.tsx`
- `src/pages/AdminReviewHistory.tsx`
- `src/pages/BurnQueue.tsx`
- `src/pages/SmsLogs.tsx`
- `src/hooks/useUploadTracking.ts` consumers
- `src/components/upload-tracking/InterviewBreakdownTable.tsx`
- any other table I find via `rg "itemsPerPage|pageSize"`.

Each call site passes a unique key (e.g. `"interview-tracking"`, `"admin-review-history"`). Current page number stays per-session (not persisted) — only page size persists, matching the spec ("once pagination is set, keep it").

## 4. Development gaps — OUT OF SCOPE, logged for next cycle

I'll do a deeper audit on implementation and produce a written report only (no code). Expected gaps to flag for the next plan (not implemented here):

- **No automated tests** (unit / integration / e2e). No CI gate, no Playwright/Vitest harness.
- **Edge function observability**: no structured logging, no per-function error budget / alerting beyond raw logs.
- **No retry / dead-letter** for `process-mobile-zip`, `analyze-pdf`, `send-failed-audit-sms` — failures are silent.
- **Audit trail gaps**: timeline shows reviews and re-audits, but assignment changes, role changes, FM reassignments, and lock-exemption changes are not in one timeline.
- **Granular role permissions**: roles are coarse — no per-feature permission matrix (e.g. "can override", "can manage burn queue", "can edit policy") separate from role enum.
- **Bulk operations**: no bulk reassign, bulk delete, bulk re-audit, bulk burn from tracking page.
- **Search**: no global search (Cmd-K) across interviews, users, file names, agents.
- **Saved filters / views** on Interview Tracking and Analytics.
- **Export limits**: PDF/CSV exports run on the client and choke on >5k rows; needs server-side export edge function with email-on-completion.
- **Notification preferences**: users can't opt in/out per category (failed audit, override, announcement, chat) beyond push toggle.
- **Internationalisation**: hard-coded English strings throughout.
- **Accessibility**: no audit (focus order, ARIA, colour contrast in dark mode, keyboard navigation in dialogs).
- **Mobile UX**: some tables still horizontally scroll on mobile despite accordion pattern; review wizard not yet fully mobile-first.
- **Storage lifecycle**: no signed-URL TTLs on audit artefacts; reliance on RLS only.
- **Background jobs**: cron jobs exist but no central job-health dashboard (last-run, failure count).
- **Data validation**: filename regex enforced client-side but not via DB CHECK/trigger — bad uploads can still land via direct API.
- **API rate limiting** on edge functions exposed via anon key.
- **Versioning** of audit checklist schema — historical audits can break if questions are renumbered.
- **Real-time presence** is partial — no "X is also reviewing this interview" indicator on the review page.
- **Backup / restore** UX — no admin-facing point-in-time recovery view.
- **Onboarding / help** — no in-app tour, no contextual tooltips for new roles.
- **GDPR / data deletion**: no self-serve "delete my data" flow for ex-agents.

I'll expand this list with file-level references in the closing message of the build phase.

## Out of scope (this plan)

- Implementing any "Development Gaps" item.
- Re-styling the inbox shell or chat policies.
- Touching upload/Quick Re-Audit/PDF report flows already completed in prior turns.

&nbsp;

ADD TO THIS DEVELOPMENT:  
- Temporarily deactivate the SMS notification for now.