---
name: Per-Interview FM Reassignment
description: Reassign individual interviews to different FMs via interview_fm_overrides table, without moving the entire agent
type: feature
---
The "Reassign FM" action on the Interview Tracking page moves a single interview (audit_id) to a different Field Manager without affecting the agent's other interviews.

**Table**: `interview_fm_overrides` (audit_id UNIQUE, field_manager_id, assigned_by, notes)
- Upsert on audit_id conflict

**Priority logic**: Override FM > team_assignments FM
- InterviewTracking FM filter: checks `fmOverrideMap.get(audit.id)` first, falls back to `teamAssignments` by interviewer_code
- FieldManagerDashboard: fetches team audits, excludes overridden-away audits, includes override audits assigned to this FM

**RLS**: Viewable by all approved users. Insert/update by FM, contractor, sub_contractor, admin, super_admin. Delete by admin/super_admin only.
