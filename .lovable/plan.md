## Plan: Add "Reassign to FM" Action on Interview Tracking Page

### What It Does

Adds a "Reassign FM" option in the action dropdown menu on the Interview Tracking page. When clicked, a dialog opens showing the interview's current Field Manager and a dropdown to select a new one. On confirmation, the `team_assignments` record for that interview ID is updated to the new field manager. However, this does not affect other interviews under the interviewer Code.   
  
Please note: only the interview ID is moved to the new FM. All other interview ID for the interviewer code remains intact under the main FM.

### Who Can Use It

Field managers, sub-contractors, contractors, admins, and super admins (all roles that already access the tracking page).

### Changes

**1. New component: `src/components/tracking/ReassignFMDialog.tsx**`

A dialog with:

- Display of the interview file name and current FM (if any)
- A Select dropdown populated from the canonical FM list (profiles + user_roles where role = field_manager)
- Confirm button that updates the `team_assignments` row matching the interview's `interviewer_code` to set `field_manager_id` to the selected FM
- If no `team_assignments` record exists for that code, insert a new approved record

**2. Edit: `src/pages/InterviewTracking.tsx**`

- Import `ReassignFMDialog`
- Add state: `showReassignDialog`, `reassignInterview`
- Add a "Reassign FM" `DropdownMenuItem` (with a `Users` icon) in `renderActionDropdown`, visible when the interview has metadata (i.e., has an `interviewer_code`), and the user role is in the allowed list
- Render `ReassignFMDialog` at the bottom of the page alongside other dialogs
- Invalidate `tracking-interviews` and `team-assignments-tracking` queries on success

### Database

No schema changes needed. The `team_assignments` table already has the required columns (`interviewer_code`, `field_manager_id`, `status`, `contractor_id`). Existing RLS policies allow updates by contractors, admins, super_admins, and sub-contractors with FM assignments.

### Technical Details

The update query:

```sql
UPDATE team_assignments 
SET field_manager_id = <new_fm_id>
WHERE interviewer_code = <code> AND status = 'approved'
```

If no approved record exists, insert one with status = 'approved' using the interview's contractor_id from metadata.