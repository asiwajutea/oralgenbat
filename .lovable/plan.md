

## Plan: Mobile-First Fraud Analytics + Homepage Critical Alerts

### Part 1: Mobile Optimization for Fraud Analytics Dashboard

**File: `src/pages/FraudAnalyticsDashboard.tsx`**
- Make the TabsList horizontally scrollable on mobile instead of cramming 5 tabs into a tiny grid
- Change `grid grid-cols-5` to a horizontal scroll container with `overflow-x-auto` and `flex` layout on mobile
- Add proper mobile padding/spacing

**File: `src/components/fraud-dashboard/LeaderboardTab.tsx`**
- On mobile, replace the wide table with an accordion/card-based layout (following the existing mobile accordion pattern used on Team Management, Payment Tracking pages)
- Each agent becomes a compact card showing: rank, agent code, grade badge, fraud score in the header
- Expandable content reveals: contractor, interviews, pass rate, avg names, avg audio
- Keep the search input full-width on mobile
- Keep the table for desktop (use `useIsMobile()` hook to toggle)

**File: `src/components/fraud-dashboard/FraudBreakdownTab.tsx`**
- Same accordion pattern on mobile: show agent code + grade + overall score in header
- Expanded view shows the 5 indicator scores and detail breakdown
- Keep desktop table as-is

**File: `src/components/fraud-dashboard/AuditReportTab.tsx`**
- Summary cards: keep `grid-cols-2` on mobile (already works)
- Per-agent table: convert to accordion cards on mobile with agent code + pass rate in header, expanded details for all counts

**File: `src/components/fraud-dashboard/TrendsTab.tsx`**
- Charts already use `ResponsiveContainer` so they resize well
- Make agent badge selection area scrollable with better touch targets (larger badges, more padding)
- Reduce chart height on mobile from 300 to 220px

**File: `src/components/fraud-dashboard/OverviewTab.tsx`**
- Summary cards already use `grid-cols-2` on smallest screens -- good
- No major changes needed

**File: `src/components/fraud-dashboard/FraudHeatmap.tsx`**
- Reduce grid columns on mobile from `grid-cols-6` to `grid-cols-5` for better touch targets
- Legend: wrap to 2 rows on mobile using `flex-wrap`

**File: `src/components/fraud-dashboard/AgentComparisonChart.tsx`**
- Reduce chart height on mobile

### Part 2: Critical Fraud Alerts on Homepages

**File: `src/components/analytics/CriticalAgentsCard.tsx`**
- Make it mobile-friendly: on mobile, stack agent info vertically instead of horizontal flex
- Grade badge, score, and "View Report" button stack vertically on small screens

**File: `src/components/home/AdminDashboard.tsx`**
- Import and add `CriticalAgentsCard` component after the stats grid and before Quick Actions
- This shows C/D grade agents requiring immediate attention

**File: `src/components/home/ContractorDashboard.tsx`**
- Import and add `CriticalAgentsCard` after stats grid
- The existing `useCriticalAgentsFraud` hook already scopes by role

**File: `src/components/home/SubContractorDashboard.tsx`**
- Import and add `CriticalAgentsCard` after stats grid

**File: `src/components/home/FieldManagerDashboard.tsx`**
- Import and add `CriticalAgentsCard` after stats grid

### Technical Summary

| File | Change |
|------|--------|
| `src/pages/FraudAnalyticsDashboard.tsx` | Scrollable tabs on mobile |
| `src/components/fraud-dashboard/LeaderboardTab.tsx` | Accordion cards on mobile, table on desktop |
| `src/components/fraud-dashboard/FraudBreakdownTab.tsx` | Accordion cards on mobile |
| `src/components/fraud-dashboard/AuditReportTab.tsx` | Accordion cards on mobile |
| `src/components/fraud-dashboard/TrendsTab.tsx` | Better touch targets, smaller chart height on mobile |
| `src/components/fraud-dashboard/FraudHeatmap.tsx` | Fewer columns on mobile |
| `src/components/fraud-dashboard/AgentComparisonChart.tsx` | Responsive chart height |
| `src/components/analytics/CriticalAgentsCard.tsx` | Mobile-friendly layout (vertical stacking) |
| `src/components/home/AdminDashboard.tsx` | Add CriticalAgentsCard |
| `src/components/home/ContractorDashboard.tsx` | Add CriticalAgentsCard |
| `src/components/home/SubContractorDashboard.tsx` | Add CriticalAgentsCard |
| `src/components/home/FieldManagerDashboard.tsx` | Add CriticalAgentsCard |

All changes use the existing `useIsMobile()` hook and follow the established accordion-on-mobile pattern already used across the app (Team Management, Payment Tracking pages).

