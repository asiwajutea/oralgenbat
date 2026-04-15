

## Fix: FM Filter on Tracking Page Should Use Team Assignments

### Problem

The FM filter matches `interview.field_manager` (free-text from metadata) against `profiles.full_name`. These rarely match because:
- Metadata has entries like "Isaac pamilerin", "Godwin hellen", "Emmanuel adebisi"
- Profile names are "Hellen Godwin ", "Taiwo Mary Ogara ", "Tobiloba idowu "

Result: every FM filter returns 0 results except "Not Assigned".

### Solution

Use `team_assignments` (which maps `field_manager_id` → `interviewer_code`) instead of the free-text `field_manager` column. The page already fetches `teamAssignments` data. Each interview has `interviewer_code`.

### Changes — `src/pages/InterviewTracking.tsx`

**1. Change FM filter value from `full_name` to `id`**

In the Select dropdown (~line 1368), use `fm.id` as the value instead of `fm.full_name`:
```tsx
<SelectItem key={fm.id} value={fm.id}>{fm.full_name}</SelectItem>
```

**2. Fetch all team assignments for FM filtering (super_admin case)**

The existing `teamAssignments` query is scoped by role. For the FM filter to work for super admins, ensure all approved team assignments are fetched when the user is super_admin (remove the FM-scoping conditions for super_admin).

**3. Rewrite the FM filter logic (~lines 608-614)**

Instead of comparing free-text strings, look up which interviewer codes belong to the selected FM via `teamAssignments`:

```typescript
if (filters.fieldManager) {
  if (filters.fieldManager === "not_assigned") {
    // Interview's interviewer_code is not in any team assignment
    const allAssignedCodes = teamAssignments.map(t => t.interviewer_code);
    if (allAssignedCodes.includes(interview.interviewer_code)) return false;
  } else {
    // Filter by FM id — find codes assigned to this FM
    const fmCodes = teamAssignments
      .filter(t => t.field_manager_id === filters.fieldManager)
      .map(t => t.interviewer_code);
    if (!fmCodes.includes(interview.interviewer_code)) return false;
  }
}
```

**4. Ensure `teamAssignments` query fetches all assignments for super_admin**

Update the query (~line 266-288) so that when `isSuperAdmin`, it fetches all approved team assignments without FM-id filtering (it already has `isSuperAdmin` in the `enabled` condition but doesn't actually fetch for that case).

### Files Modified

| File | Change |
|------|--------|
| `src/pages/InterviewTracking.tsx` | FM filter logic, Select value, teamAssignments query scope |

No database changes needed.

