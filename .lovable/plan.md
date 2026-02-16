## Comprehensive Fraud Analytics Dashboard

A new dedicated page at `/fraud-analytics` accessible to super_admin, admin, contractor, sub_contractor, and field_manager roles. This page provides a full-featured, interactive analytics dashboard focused on agent performance, fraud detection, leaderboard rankings, and timeline comparisons -- all without AI dependencies.

### Page Structure

The page will have the following major sections organized in tabs:

**Tab 1: Overview**

- Team health summary cards: total agents, average fraud score, agents at risk (C/D grade), team pass rate, total interviews
- Fraud grade distribution pie chart (how many A, B, C, D agents)
- Overall audit status breakdown (passed/failed/pending/re-audit counts)
- Heatmap-style grid showing fraud scores across all agents

**Tab 2: Agent Leaderboard**

- Full sortable/searchable table of ALL agents with columns: rank, agent code, name, contractor, total interviews, pass rate, avg names, avg audio duration, re-audit rate, fraud score, fraud grade, performance score, performance grade
- Three time-period toggles: 13 weeks, 365 days, Lifetime
- Color-coded rows by fraud grade
- Click any agent row to navigate to their detailed fraud analysis report
- Export to CSV, PDF, Excel button

**Tab 3: Fraud Analysis (non-AI)**

- For each agent in scope: the full fraud indicator breakdown (interval score, audio duration score, names pattern score, page boundary score, anomaly score) displayed in a compact table
- Filter by grade (A/B/C/D), contractor, or search by agent code
- Expandable rows showing indicator details
- Bulk view of all agents' fraud profiles without needing AI

**Tab 4: Trends & Comparison**

- Line charts comparing agent performance over time (weekly pass rates, interview volume)
- Period selector: 13 weeks, 365 days
- Ability to select/compare up to 5 agents on the same chart
- Team-wide trend lines for pass rate, re-audit rate, interview volume

**Tab 5: Audit Report**

- Overall team audit statistics: total passed, failed, pending, re-audit breakdown
- Per-agent audit summary table with pass/fail/pending/re-audit counts
- Drill-down capability to see individual agent audit history

### Role-Based Scoping

Uses the existing `useRoleScope` hook from `useRoleAnalytics.ts`:

- **super_admin**: sees all agents globally
- **admin**: sees agents under their assigned field managers
- **contractor**: sees all agents for their contractor_id
- **sub_contractor**: sees agents under their assigned field managers
- **field_manager**: sees only their team members

### New Files


| File                                                        | Purpose                                                                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/FraudAnalyticsDashboard.tsx`                     | Main page component with tabs                                                                                                                                                   |
| `src/hooks/useFraudDashboard.ts`                            | Data hook that fetches all agents' fraud profiles for 13-week, 365-day, and lifetime periods using existing fraud calculation functions (extracted from `useFraudAnalytics.ts`) |
| `src/components/fraud-dashboard/OverviewTab.tsx`            | Summary cards + fraud grade distribution chart + health indicators                                                                                                              |
| `src/components/fraud-dashboard/LeaderboardTab.tsx`         | Full agent leaderboard table with time-period toggle and export                                                                                                                 |
| `src/components/fraud-dashboard/FraudBreakdownTab.tsx`      | Non-AI fraud indicator table for all agents with expandable details                                                                                                             |
| `src/components/fraud-dashboard/TrendsTab.tsx`              | Timeline comparison charts with agent selection                                                                                                                                 |
| `src/components/fraud-dashboard/AuditReportTab.tsx`         | Overall and per-agent audit statistics                                                                                                                                          |
| `src/components/fraud-dashboard/FraudGradeDistribution.tsx` | Pie chart of A/B/C/D distribution                                                                                                                                               |
| `src/components/fraud-dashboard/AgentComparisonChart.tsx`   | Multi-agent comparison line chart                                                                                                                                               |
| `src/components/fraud-dashboard/FraudHeatmap.tsx`           | Visual grid of agent fraud scores                                                                                                                                               |


### Routing & Navigation Changes


| File                           | Change                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/App.tsx`                  | Add route `/fraud-analytics` wrapped in a new `FraudAnalyticsRoute` guard (allows super_admin, admin, contractor, sub_contractor, field_manager) |
| `src/components/Header.tsx`    | Add "Fraud Analytics" nav link for eligible roles                                                                                                |
| `src/components/MobileNav.tsx` | Add "Fraud Analytics" link for eligible roles                                                                                                    |


### Technical Approach

1. **Reuse existing fraud calculation functions** from `useFraudAnalytics.ts` (interval, audio, names, boundary, anomaly scorers) -- extract them as shared utilities so both the single-agent page and the dashboard can use them.
2. **Time period support**: The new hook `useFraudDashboard.ts` will accept a period parameter (`13weeks`, `365days`, `lifetime`) and adjust the date filter accordingly when querying `interview_metadata`.
3. **Performance**: For the "all agents" view, batch-fetch all interview_metadata records in the scope, then group by interviewer_code and calculate fraud profiles client-side (same approach as `useCriticalAgentsFraud` but including ALL grades, not just C/D).
4. **Charts**: Use recharts (already installed) for pie charts, line charts, and bar charts. The heatmap will be a custom CSS grid component.
5. **No AI dependency**: The fraud analysis section shows raw indicator scores and grades computed entirely client-side, independent of the `fraud-analysis` edge function.
6. **Export**: CSV export for leaderboard data using existing `ExportButton` pattern.