

## Add Error Detection Stats — Upload Tracking + Admin/Super-Admin Home

### What you'll see

Two new metric cards on the **Upload Tracking** page (and a compact summary on the **Admin / Super Admin home dashboard**):

1. **Errors Detected** — total checklist questions answered "No" across all completed reviews in the selected period, shown as `X / Y` (where Y = total questions answered = interviews-reviewed × 14). Includes a percentage.
2. **First-Audit Failures** — number of interviews whose **first** completed audit checklist had at least one failure, plus a percentage of all first audits in the period.

Both cards respect:
- The active **date range** selector at the top of Upload Tracking (7d / 13w / 365d / Custom).
- The same **role-based scoping** already used by the Upload Tracking page (so Field Managers, Contractors, Sub-Contractors only see their own scope; Admin/Super-Admin/QA see everything).

The Admin/Super-Admin home dashboard gets a smaller "Errors Detected (lifetime)" + "First-Audit Failures (lifetime)" block, with a link → Upload Tracking for the date-filtered breakdown.

### Definitions

- **Error** = one checklist question answered `"no"` (per `audit_checklist_progress.items[].answer`).
- **Maximum possible errors** = `completed_checklists_in_period × 14`.
- **First-audit failure** = an interview whose earliest `is_completed = true` checklist row has `has_failures = true`. Re-audits are excluded from the denominator and numerator.
- Date filter is applied to the **audit's `uploaded_at`** (matches the rest of the Upload Tracking page) — not to when the review happened — so the cards stay in sync with the volume cards above them.

### Database — one new RPC

`get_upload_tracking_error_stats(p_start_date timestamptz, p_end_date timestamptz)` returns one row:

| Column | Meaning |
|---|---|
| `completed_checklists` | # completed checklist runs for audits uploaded in the range |
| `total_questions` | `completed_checklists × 14` |
| `failed_questions` | total `"no"` answers across those checklists |
| `first_audits_total` | # audits in range whose earliest checklist is completed |
| `first_audits_failed` | of those, how many had `has_failures = true` |

Server-side scoping reuses the existing `user_can_view_audit_for_tracking()` helper so the same role rules apply automatically. Admin / Super-Admin / QA bypass the scope check.

A **lifetime** variant (no date params) is exposed by calling the same RPC with `p_start_date = '1970-01-01'` and `p_end_date = NOW() + 1 day` — no second function needed.

### Frontend changes

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | Create `get_upload_tracking_error_stats` RPC |
| `src/hooks/useUploadTracking.ts` | Add `useUploadTrackingErrorStats(startDate, endDate)` hook |
| `src/pages/UploadTrackingDashboard.tsx` | Render two new cards in the Summary Cards grid (above the sticky period selector), wired to the active `startDate`/`endDate` |
| `src/components/home/AdminDashboard.tsx` | Add a compact "Quality Signals" card row showing lifetime Errors Detected (`X / Y · Z%`) + First-Audit Failures (`X / Y · Z%`), with "View details →" linking to `/upload-tracking` |

### Card visual

```
┌───────────────────────────┐  ┌───────────────────────────┐
│ Errors Detected           │  │ First-Audit Failures      │
│ 783 / 7,782               │  │ 412 / 940                 │
│ 10.1% of checks failed    │  │ 43.8% failed first try    │
└───────────────────────────┘  └───────────────────────────┘
```

### Out of scope

- No changes to the existing volume cards, charts, period table, or interview breakdown table.
- No per-question breakdown here (already covered by Checklist Performance Analytics).
- Re-audit failures are not counted toward "first-audit failures" by design.

