

## Plan: Fix Bugs, Add SMS Logs Nav, Organize Mobile Nav, and Implement Checklist Analytics

This plan covers bug fixes (team assignments, duplicate deletion, missing nav items), mobile nav reorganization, and a major new checklist performance tracking feature.

---

### 1. Fix Team Assignments Reappearing as Unassigned (1000-Row Limit)

**File: `src/hooks/useTeamAssignments.ts`**

The `useUnassignedInterviews` hook fetches `audits` and `interview_assignments` without pagination. With 1045+ passed audits and 1045 assignments, both queries hit the default 1000-row limit, causing mismatches -- some assigned audits appear "unassigned" because they weren't fetched in one of the two queries.

**Fix:**
- Use `{ count: 'exact', head: true }` to get the assignment count, and use paginated fetching (the existing `batchedInQuery` pattern or range-based fetching) for both the `audits` and `interview_assignments` queries
- Alternatively, use a simpler approach: fetch only `audit_id` from `interview_assignments` using paginated range queries, then compare against passed audits also fetched with pagination
- Import and use `fetchAllRows` from `src/utils/paginatedFetch.ts` for both queries

---

### 2. Fix Duplicate Detection Delete (RLS Policy)

**Database migration needed**

The `re_audit_submissions` table has no DELETE policy. When the duplicate delete tries to clean up related `re_audit_submissions` rows, it fails silently or throws an RLS error. Additionally, other related tables (`audit_checklist_progress`, `artifact_correction_comments`, `interview_assignments`) also need cleanup but aren't being deleted.

**Fix:**
- Add DELETE RLS policies for `re_audit_submissions` (admin/super_admin only)
- Add DELETE RLS policies for `audit_checklist_progress` (admin/super_admin only -- the existing policy only allows auditors to delete their own)
- Add DELETE RLS policies for `artifact_correction_comments` (admin/super_admin only)
- Add DELETE RLS policy for `interview_assignments` (admin/super_admin -- already covered by the ALL policy)

**File: `src/pages/DuplicateInterviews.tsx`**
- Also delete from `audit_checklist_progress`, `artifact_correction_comments`, and `interview_assignments` before deleting the audit record

---

### 3. Add Duplicate Detection and SMS Logs to Mobile Nav

**File: `src/components/MobileNav.tsx`**

The mobile nav is missing:
- "Duplicate Detection" under Admin section
- "SMS Logs" under Admin section

**Fix:**
- Add `<NavItem to="/admin/duplicates" icon={Copy}>Duplicate Detection</NavItem>` to the Admin section
- Add `<NavItem to="/admin/sms-logs" icon={MessageSquare}>SMS Logs</NavItem>` to the Admin section
- Import `Copy` and `MessageSquare` icons

---

### 4. Add SMS Logs to Desktop Nav

**File: `src/components/Header.tsx`**

SMS Logs page exists at `/admin/sms-logs` but is not in the desktop Admin dropdown.

**Fix:**
- Add a "SMS Logs" link to the Admin dropdown menu items (between "Locks" and "Duplicate Detection")

---

### 5. Organize Mobile Nav to Mirror Desktop Menu

**File: `src/components/MobileNav.tsx`**

Currently the mobile nav has a flat structure. Reorganize to match the desktop grouped structure:

- **Home** (all roles)
- **Interviews** (auditor, admin)
- **My Dashboard** (field_manager, contractor)
- **Operations** section header: Tracking, Payments, Data Entry
- **Teams** section header: Team Management, Team Approvals
- **Analytics** section header: My Analytics/Analytics, Fraud Analytics
- **Communications** section header: Notice Board, Push Notifications
- **My Reviews** (auditor only)
- **Admin** section header: Manage Users, Review History, Team Assignments, ZIP Diagnostics, Locks, SMS Logs, Duplicate Detection

This matches the desktop dropdown groupings while using section headers (already partially in place) instead of collapsible dropdowns for mobile.

---

### 6. Checklist Performance Tracking (Major Feature)

This requires new database infrastructure and UI components.

#### 6a. Database: Checklist Analytics View

The checklist data already exists in `audit_checklist_progress.items` (JSONB array). Each item has `id` (1-13), `question`, `answer` ("yes"/"no"), and `category`. We need to extract and aggregate this efficiently.

**Database migration:**
- Create a materialized view or use a database function that extracts checklist answers from the JSONB and joins with audit/metadata tables for scoping
- Create an RPC function `get_checklist_analytics` that accepts parameters (period, scope) and returns aggregated question-level pass/fail counts
- Create an RPC function `get_agent_checklist_performance` that returns per-agent checklist stats

Alternatively, since the `items` JSONB is already structured, we can do client-side aggregation by fetching `audit_checklist_progress` with joins. Given the data volume (likely <5000 completed checklists), client-side processing is feasible.

**Approach: Client-side aggregation with a new hook**

#### 6b. New Hook: `src/hooks/useChecklistAnalytics.ts`

Create a hook that:
1. Fetches all completed `audit_checklist_progress` rows (where `is_completed = true`)
2. Joins with `audits` (for `file_name`, `status`, `uploaded_at`) and `interview_metadata` (for `interviewer_code`, `contractor_id`, `field_manager`)
3. Filters by time period (1 week, 13 weeks, 1 year, lifetime)
4. Extracts the JSONB `items` array and aggregates:
   - Per question: total answered, total "yes", total "no", pass rate
   - Per agent (interviewer_code): total questions, passed, failed, pass percentage
   - Ranking by pass percentage
5. Scopes data by role (using the same pattern as `useRoleAnalytics.ts`):
   - Field Manager: only their team's interviewer codes
   - Sub-contractor: interviewer codes under their assigned field managers
   - Contractor: their contractor_id
   - Admin/Super-admin: all data

**Exports:**
- `useChecklistQuestionStats(period, scope)` -- returns per-question pass/fail/rate
- `useChecklistAgentRanking(period, scope)` -- returns per-agent ranking
- `useChecklistSummary(period, scope)` -- returns totals (total questions, passed, failed, %)

#### 6c. New Component: `src/components/fraud-dashboard/ChecklistAnalyticsTab.tsx`

A new tab on the Fraud Analytics Dashboard page showing:
- **Summary cards**: Total checklist questions answered, Total passed, Total failed, Pass percentage
- **Period filter**: 1 Week, 13 Weeks, 1 Year, Lifetime (Select dropdown)
- **Question performance table**: All 13 questions ranked by failure rate (highest failures first), with pass/fail counts and percentage bar
- **Agent ranking table**: Each agent with total questions, passed, failed, pass %, ranked by performance
- **Visual chart**: Bar chart showing pass/fail per question category (A, B, C)

#### 6d. Dashboard Integration

**Files: `src/components/home/FieldManagerDashboard.tsx`, `src/components/home/SubContractorDashboard.tsx`, `src/components/home/ContractorDashboard.tsx`, `src/components/home/AdminDashboard.tsx`**

Add a "Checklist Performance" card to each dashboard showing:
- Total checklist questions for their team
- Total passed / Total failed
- Pass percentage
- Period filter dropdown (1 week, 13 weeks, 1 year, lifetime)

Each dashboard will use `useChecklistSummary` with the appropriate scope.

#### 6e. Fraud Analytics Dashboard Tab

**File: `src/pages/FraudAnalyticsDashboard.tsx`**

Add a new "Checklist" tab to the existing tabs (Overview, Leaderboard, Fraud Breakdown, Trends, Audit Report) that renders `ChecklistAnalyticsTab`.

---

### Technical Summary

| File | Change |
|------|--------|
| `src/hooks/useTeamAssignments.ts` | Use paginated fetching for audits and assignments to fix 1000-row limit |
| Database migration | Add DELETE policies on `re_audit_submissions` for admins |
| `src/pages/DuplicateInterviews.tsx` | Also delete from `audit_checklist_progress`, `artifact_correction_comments`, `interview_assignments` |
| `src/components/MobileNav.tsx` | Add Duplicate Detection + SMS Logs to Admin; reorganize to mirror desktop groupings |
| `src/components/Header.tsx` | Add SMS Logs to Admin dropdown |
| `src/hooks/useChecklistAnalytics.ts` | New hook for checklist performance analytics (question stats, agent ranking, summary) |
| `src/components/fraud-dashboard/ChecklistAnalyticsTab.tsx` | New tab component for checklist analytics with charts and tables |
| `src/pages/FraudAnalyticsDashboard.tsx` | Add "Checklist" tab |
| `src/components/home/FieldManagerDashboard.tsx` | Add checklist performance summary card |
| `src/components/home/SubContractorDashboard.tsx` | Add checklist performance summary card |
| `src/components/home/ContractorDashboard.tsx` | Add checklist performance summary card |
| `src/components/home/AdminDashboard.tsx` | Add checklist performance summary card |

