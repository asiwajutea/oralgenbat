

## Plan: Per-Interview FM Reassignment

### Problem

The current `ReassignFMDialog` updates `team_assignments` by `interviewer_code`, which reassigns the **entire agent** (all interviews) to a new FM. Your use case requires moving only **one specific interview** while keeping the agent's other interviews under the original FM.

### Solution

Create a new `interview_fm_overrides` table that stores per-interview FM assignments. When an override exists for an interview, it takes priority over the agent-level `team_assignments` mapping.

### Database Change

**New table: `interview_fm_overrides`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| audit_id | uuid | The specific interview being reassigned |
| field_manager_id | uuid | The FM receiving this interview |
| assigned_by | uuid | Who performed the reassignment |
| created_at | timestamptz | When it was reassigned |
| notes | text | Optional reason |

RLS: viewable by all approved users, insertable/updatable by FM, contractor, sub_contractor, admin, super_admin.

### Code Changes

**1. `src/components/tracking/ReassignFMDialog.tsx`** — Rewrite to insert/upsert into `interview_fm_overrides` instead of updating `team_assignments`. Pass `auditId` (the specific interview) instead of `interviewerCode`.

**2. `src/pages/InterviewTracking.tsx`** — Update the FM filter logic to check `interview_fm_overrides` first. If an interview has an override, use that FM; otherwise fall back to `team_assignments` by `interviewer_code`.

**3. `src/pages/FieldManagerDashboard.tsx`** — After fetching interviews by team codes, also fetch any interviews with overrides pointing to this FM. Exclude interviews that have overrides pointing to a *different* FM. This ensures:
- The 1 reassigned interview appears on Manager A's dashboard
- The other 9 interviews stay on Manager B's dashboard
- The reassigned interview no longer shows on Manager B's dashboard

### How It Works (Your Example)

1. Agent 730 is assigned to Manager B in `team_assignments`
2. Manager B clicks "Reassign FM" on the errored interview → selects Manager A
3. A row is inserted into `interview_fm_overrides`: `{ audit_id: <that interview>, field_manager_id: Manager A's ID }`
4. Manager A's dashboard: fetches team codes + override interviews → sees the 1 reassigned interview
5. Manager B's dashboard: fetches team codes (still includes Agent 730) but excludes interviews with overrides to other FMs → sees 9 interviews

### Files Modified

| File | Change |
|------|--------|
| **New migration** | Create `interview_fm_overrides` table with RLS |
| `src/components/tracking/ReassignFMDialog.tsx` | Insert into overrides table instead of updating team_assignments |
| `src/pages/InterviewTracking.tsx` | FM filter respects overrides |
| `src/pages/FieldManagerDashboard.tsx` | Include override interviews, exclude overridden-away interviews |

