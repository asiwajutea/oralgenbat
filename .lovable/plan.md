
## Plan: Split Checklist Analytics into First Audit vs Re-Audit

The checklist tab currently aggregates all checklist data together. This plan adds a toggle to view "First Audit" results separately from "Re-Audit" results, so leaders can understand why interviews fail on the first attempt without the re-audit data (which has resolved issues) skewing the picture.

---

### How It Works

Each audit has an `is_re_audit` boolean field. When `false`, it's the first review of an interview. When `true`, it's a re-audit after corrections. The hook will fetch this field alongside the checklist data and split results accordingly.

The UI will show two sub-tabs or a toggle: "First Audit" and "Re-Audit", each showing its own summary cards, question performance table, agent ranking, and category chart. This makes it easy to compare first-attempt failure patterns vs re-audit outcomes.

---

### Technical Changes

**File: `src/hooks/useChecklistAnalytics.ts`**

- Add a new parameter `auditType: 'first' | 'reaudit' | 'all'` (default `'all'`) to the raw data hook
- When fetching from `audit_checklist_progress`, also fetch the audit's `is_re_audit` status by querying the `audits` table for each `audit_id`
- Filter the raw checklist data: `'first'` keeps only `is_re_audit === false`, `'reaudit'` keeps only `is_re_audit === true`, `'all'` keeps everything
- Update `useChecklistSummary`, `useChecklistQuestionStats`, and `useChecklistAgentRanking` to accept and pass through the `auditType` parameter
- Update query keys to include `auditType`

**File: `src/components/fraud-dashboard/ChecklistAnalyticsTab.tsx`**

- Add a `useState<'first' | 'reaudit'>('first')` for the audit type toggle (default to "First Audit" since that's the primary use case)
- Add a segmented toggle or tabs at the top: "First Audit" | "Re-Audit"
- Pass the selected `auditType` to all three hooks (`useChecklistSummary`, `useChecklistQuestionStats`, `useChecklistAgentRanking`)
- All existing UI (summary cards, category chart, question table, agent ranking table) will automatically reflect the filtered data
- Add a small info text explaining the difference: "First Audit shows results from the initial review. Re-Audit shows results after corrections were submitted."

### Dashboard Cards (No Change Needed)

The dashboard summary cards on FM/Contractor/Admin dashboards will continue to show "all" data by default, which gives the overall picture. The detailed first-vs-reaudit split is only needed on the analytics tab.
