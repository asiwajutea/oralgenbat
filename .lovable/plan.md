## Plan: Navigation Reorganization, Rich Text Feedback, Payment/Assignment Sync, Stats Fixes, and Team Stats

This plan addresses 11 items across 5 areas: navigation, interview review feedback, payment-to-assignment sync, stat card accuracy, and team assignment stats.

---

### 1. Reorganize Desktop Navigation Menu

**File: `src/components/Header.tsx**`

The current navigation has many top-level items. Group them into logical dropdowns:

**Proposed groupings (role-aware):**

- **Home** (standalone - all roles)
- **Interviews** (standalone - auditor, admin)
- **My Dashboard** (standalone - field_manager, contractor)
- **Operations** (dropdown - roles that see tracking/payments/data-entry):
  - Tracking (field_manager, contractor, admin, sub_contractor)
  - Payments (field_manager, contractor, admin, sub_contractor)
  - Data Entry (data_entry_clerk, quality_assurance_manager, admin)
- **Teams** (dropdown - roles that see team management/approvals):
  - Team Management (field_manager, sub_contractor)
  - Team Approvals (contractor, admin)
- **Analytics** (dropdown - existing, keep as-is)
- **Communications** (dropdown - existing, keep as-is)
- **My Reviews** (standalone - auditor only)
- **Admin** (dropdown - admin only):
  - Manage Users
  - Review History
  - Team Assignments
  - ZIP Diagnostics
  - Locks

This reduces top-level items from ~12 to ~7-8, using NavigationMenu dropdowns for grouped items.

---

### 2. Rich Text Format for Failure Comment Box

**File: `src/components/review/ReviewActions.tsx**`

The `Textarea` for "Reason for Failure" and "Action Plan" in the fail dialog (lines 439-456) does not preserve paragraph breaks when saved. The issue is that `\n` characters are stored but rendered without `whitespace-pre-wrap`.

Changes:

- The Textarea already captures newlines. The stored `review_comment` and `action_plan` text contains `\n` characters. No change needed to the input controls -- they already support multi-line text entry.
- The real issue is on the **display** side. The `reviewComment` state is pre-populated with the parsed feedback which uses `\n\n` between items, so paragraphs are properly stored.

---

### 3. Display Failure Feedback as Standard Text with Paragraphs

**File: `src/components/review/ReviewCommentsPanel.tsx**` (lines 96, 102)

The `<p>` tag already has `whitespace-pre-wrap` class, which should preserve line breaks. However, the raw `review_comment` from the database may not have clean paragraph breaks. Need to verify and ensure the display properly renders paragraphs.

**File: `src/components/tracking/FailedInterviewModal.tsx**` (lines 339-343, 350-351)

The failure reason and action plan display on the tracking page's FailedInterviewModal uses `<p className="text-sm">` without `whitespace-pre-wrap`. This means line breaks are collapsed.

Changes:

- Add `whitespace-pre-wrap` to the review_comment display (line 341)
- Add `whitespace-pre-wrap` to the action_plan display (line 351)

---

### 4. Auto-Complete Assignments When Payment Journey is Marked

**Approach:** Create a database trigger that automatically marks the `interview_assignments` entry as completed (and resolves any flagged issue) when a `payment_records` row is inserted or updated with `payment_type` in ('new_payment', 'addition', 'deduction').

**Database migration:** Create a trigger function `auto_complete_on_payment()` that:

1. When a payment record is inserted/updated, look up the `audit_id` (or match by `folder_name` to `audits.file_name`)
2. Find the corresponding `interview_assignments` row for that audit_id
3. If `entry_status` is not already `data_entry_complete`, update it to `data_entry_complete` with `entry_completed_at = now()`
4. If `is_flagged_for_issue = true`, auto-resolve by setting `issue_resolved_at = now()`, `is_flagged_for_issue = false`

This handles the requirement that payment_received, deduction, and addition all mark assignments as completed. Fix the issue for all existing records.

---

### 5. Fix Payment Stats Counter Accuracy

**File: `src/components/home/PaymentStatsCards.tsx**`

Current logic:

- "Assigned to Data Entry": counts all `interview_assignments` rows
- "Total Paid": counts all `payment_records` rows
- "Assigned, Not Paid": assigned - paid

**Problem**: `payment_records` may have multiple rows per interview (e.g., new_payment + addition + deduction). The count gives total payment records, not unique interviews paid. Also, the 1000-row default limit may truncate results.

Fix:

- For "Total Paid": count **unique folder_names** in payment_records (using a query that fetches distinct folder names or uses a custom approach)
- Use `{ count: "exact", head: true }` which already bypasses the data limit issue (count queries are not limited)
- Actually, the `count` with `head: true` should return the correct total. The issue is likely that multiple payment records exist per interview. Change to count distinct `folder_name` or `audit_id` values.

Alternative: Use paginated fetch to get all payment_records, then count unique folder_names client-side. Or better, use an RPC or adjust the query:

```sql
-- Count unique paid interviews
SELECT COUNT(DISTINCT folder_name) FROM payment_records
```

Since we can't do `COUNT(DISTINCT)` via the JS client directly with head:true, we'll fetch all folder_names and deduplicate client-side, or use a simpler approach: fetch the `useAllInterviewsForPayment` data (already fetched on the page) and derive counts from it.

Actually, the simplest fix for PaymentStatsCards: change the paid count to count unique audit_ids or folder_names from payment_records instead of total rows.

---

### 6. Fix Admin Review History Stats (1000-Row Limit)

**File: `src/pages/AdminReviewHistory.tsx**` (lines 182-236)

The stats query uses `supabase.from("audits").select(...)` without pagination, which hits the 1000-row default limit.

Fix: Use the `fetchAllRows` utility from `src/utils/paginatedFetch.ts` to fetch all reviewed audits for stats computation. This utility batches requests with `.range()` to bypass the 1000-row limit.

---

### 7. Add Resolved Badge to PDF Export

**File: `src/pages/AdminReviewHistory.tsx**` (exportToPDF function, lines 632-762)

Currently the PDF export does not include resolution status. Need to:

- Fetch `artifact_correction_resolved_at` and resolve_comment data in the export query (already partially fetched but not in the export query on line 552)
- Add `artifact_correction_resolved_at` to the export query select
- Also fetch the resolution comment from `artifact_correction_comments` or from the `resolve_comment` field
- In the PDF rendering, after the artifacts line, add a compact "[RESOLVED]" badge text with the resolve comment if resolved
- Keep it compact: render on the same line as artifacts or one additional line

To get the resolution comment, we need to query `artifact_correction_comments` or check if there's a resolve field on the audit. Looking at the schema, `audits` has `artifact_correction_resolved_at` and `artifact_correction_resolved_by` but no resolve comment field. The resolution comments are in `artifact_correction_comments`. However, for compactness, we can just show "[RESOLVED]" as a text marker next to the artifacts line.

For the resolve comment, we can fetch the latest comment from `artifact_correction_comments` for resolved audits or simply note it as resolved. To keep it space-efficient, show:

- `Artifacts: Scanned PDF [RESOLVED] - Resolution: "comment text"` on one or two lines

---

### 8. Add Team Stats Card to Team Assignments Page

**File: `src/pages/TeamAssignments.tsx**`

Add a new stat card (or modify `AssignmentSummaryCards`) showing per-team breakdown:

- For each team: total interviews assigned, total completed
- Display as a compact grid or within the existing summary section

**File: `src/components/assignments/AssignmentSummaryCards.tsx**`

Add a new prop for team-level stats and render an additional row of cards or a compact summary table showing each team's assigned/completed counts.

The data is already available from the `assignments` array -- just need to group by team and count `entry_status === 'data_entry_complete'`.

---

### 9. Mark Assignments as Completed from Any Source

**Approach:** In addition to the payment trigger (item 4), ensure that when any user role marks an assignment as `data_entry_complete`, it reflects everywhere. This is already handled by the existing `useBulkMarkComplete` and `useUpdateTypingStatus` hooks which update `entry_status`. The `typing_status` field appears to be separate from `entry_status`.

The `getTypingStatusBadge` function on the Team Assignments page (line 393) checks `typing_status`, not `entry_status`. Need to update the status display to also reflect `entry_status === 'data_entry_complete'` as "Completed" regardless of `typing_status`.

Changes in `src/pages/TeamAssignments.tsx`:

- Update status badge rendering to prioritize `entry_status === 'data_entry_complete'` over `typing_status`
- Show "Completed" badge (green) when `entry_status === 'data_entry_complete'`

---

### Technical Summary


| File                                                    | Change                                                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/Header.tsx`                             | Reorganize nav into grouped dropdowns: Operations, Teams, Admin                                                                         |
| `src/components/review/ReviewActions.tsx`               | Ensure Textarea preserves paragraph breaks (already works; no change needed if whitespace-pre-wrap is on display)                       |
| `src/components/review/ReviewCommentsPanel.tsx`         | Verify `whitespace-pre-wrap` is applied (already present)                                                                               |
| `src/components/tracking/FailedInterviewModal.tsx`      | Add `whitespace-pre-wrap` to review_comment and action_plan display                                                                     |
| `src/components/home/PaymentStatsCards.tsx`             | Fix "Total Paid" to count unique interviews (not total payment records)                                                                 |
| `src/pages/AdminReviewHistory.tsx`                      | Use `fetchAllRows` for stats query to bypass 1000-row limit; add resolved badge + comment to PDF export                                 |
| `src/pages/TeamAssignments.tsx`                         | Add per-team stats card; update status badge to reflect `entry_status` completion                                                       |
| `src/components/assignments/AssignmentSummaryCards.tsx` | Add per-team assigned/completed stats display                                                                                           |
| Database migration                                      | Create trigger `auto_complete_on_payment` on `payment_records` to auto-complete assignments and resolve issues when payment is recorded |
