
# Implementation Plan: Fix Blank Payment Page, Announcement Visibility, and Add "Mark as Resolved" Feature

## Issues Identified

### Issue 1: Payment Tracking Page Going Blank
The Payment Tracking page may be crashing due to unhandled errors in the data fetching or rendering logic. Common causes include:
- Unhandled promise rejections in async operations
- Null/undefined access when data is still loading
- Issues with the `AuditPagination` component when `totalPages` is 0

**Root cause identified:** In `PaymentTable.tsx` line 59-63, there's a `useMemo` that resets the page, but it's being used incorrectly (useMemo shouldn't have side effects like calling `setCurrentPage`). This can cause an infinite re-render loop.

### Issue 2: Announcement Modal Not Following Visibility Rules
Several bugs identified in `useAnnouncements.ts`:

1. **Expiry date not checked at query level** - The database query only filters by `is_active = true` but doesn't filter out expired announcements (`expires_at < now()`)

2. **Scheduled announcements shown before their time** - The query doesn't check `scheduled_at`

3. **"Show once" logic is broken** - In `shouldShowAnnouncement()`:
   - When `display_frequency === "once"` and a dismissal exists, it returns `false` (correct)
   - But the check happens after a complex acknowledgment check that may bypass it
   
4. **"Every login" logic is flawed** - The function returns `false` for `every_login`, which means it will NEVER show after the first dismissal. This is incorrect - it should use session-based logic.

### Issue 3: New Feature - "Mark as Resolved" for Failed Interviews
Add ability to mark failed interviews as having their artifact corrections resolved (sent via email), with visual indicator.

---

## Solution Plan

### Part 1: Fix Payment Tracking Page Blank Issue

**File: `src/components/payment/PaymentTable.tsx`**

Replace the problematic `useMemo` with a proper `useEffect`:

```typescript
// BEFORE (causing issues):
useMemo(() => {
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(1);
  }
}, [totalPages, currentPage]);

// AFTER (correct):
useEffect(() => {
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(1);
  }
}, [totalPages]);
```

Also add error boundary handling with try/catch for async operations.

---

### Part 2: Fix Announcement Visibility Rules

**File: `src/hooks/useAnnouncements.ts`**

1. **Update the announcements query** to filter by `expires_at` and `scheduled_at`:
```typescript
const { data, error } = await supabase
  .from("announcements")
  .select("*")
  .eq("is_active", true)
  .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
  .or('scheduled_at.is.null,scheduled_at.lte.' + new Date().toISOString())
  .order("priority", { ascending: false })
  .order("created_at", { ascending: false });
```

2. **Fix `shouldShowAnnouncement` function** with corrected logic:
```typescript
const shouldShowAnnouncement = (announcement: Announcement): boolean => {
  // Check expiry first (in case client-side check is needed as backup)
  if (announcement.expires_at && new Date(announcement.expires_at) < new Date()) {
    return false;
  }
  
  // Check scheduled time
  if (announcement.scheduled_at && new Date(announcement.scheduled_at) > new Date()) {
    return false;
  }
  
  const dismissal = dismissals.find(d => d.announcement_id === announcement.id);
  
  // Never dismissed - show it
  if (!dismissal) return true;

  const dismissedAt = new Date(dismissal.dismissed_at);
  const now = new Date();

  switch (announcement.display_frequency) {
    case "once":
      // If already dismissed, never show again
      return false;
    case "every_login":
      // Handled by provider - check session storage
      return false;
    case "daily":
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return dismissedAt < oneDayAgo;
    case "weekly":
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return dismissedAt < oneWeekAgo;
    default:
      return false;
  }
};
```

**File: `src/components/announcements/AnnouncementProvider.tsx`**

Add session-based tracking for "every_login" announcements using `sessionStorage`:
```typescript
// Track which announcements were shown this session
const shownThisSession = sessionStorage.getItem('announcements_shown_this_session');
const shownIds = shownThisSession ? JSON.parse(shownThisSession) : [];

// Filter out already-shown-this-session for every_login type
const sessionFilteredAnnouncements = pendingAnnouncements.filter(a => {
  if (a.display_frequency === 'every_login') {
    return !shownIds.includes(a.id);
  }
  return true;
});

// When dismissing, add to session storage for every_login
const dismissCurrent = (acknowledged: boolean) => {
  if (currentAnnouncement) {
    if (currentAnnouncement.display_frequency === 'every_login') {
      const shown = sessionStorage.getItem('announcements_shown_this_session');
      const ids = shown ? JSON.parse(shown) : [];
      ids.push(currentAnnouncement.id);
      sessionStorage.setItem('announcements_shown_this_session', JSON.stringify(ids));
    }
    dismissAnnouncement({ announcementId: currentAnnouncement.id, acknowledged });
    setCurrentAnnouncement(null);
  }
};
```

---

### Part 3: Add "Mark as Resolved" Feature for Failed Interviews

**Database Migration:**
Add a new column to the `audits` table:
```sql
ALTER TABLE audits ADD COLUMN artifact_correction_resolved_at timestamptz;
ALTER TABLE audits ADD COLUMN artifact_correction_resolved_by uuid;
```

**File: `src/pages/InterviewTracking.tsx`**

1. Add the resolved fields to the `TrackingInterview` interface:
```typescript
interface TrackingInterview {
  // ... existing fields
  artifact_correction_resolved_at: string | null;
  artifact_correction_resolved_by: string | null;
}
```

2. Add a mutation hook for marking as resolved:
```typescript
const markAsResolvedMutation = useMutation({
  mutationFn: async (auditId: string) => {
    const { error } = await supabase
      .from("audits")
      .update({
        artifact_correction_resolved_at: new Date().toISOString(),
        artifact_correction_resolved_by: user?.id
      })
      .eq("id", auditId);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["tracking-interviews"] });
    toast({ title: "Marked as Resolved", description: "Artifact correction marked as resolved." });
  },
});
```

3. Add visual indicator and button to the table/accordion:
   - For failed interviews (`status === "Audit Failed"`):
     - If NOT resolved: Show "Mark as Resolved" button with an orange outline
     - If resolved: Show a green "Resolved" badge with checkmark icon
   - The visual indicator should be prominent to easily identify resolved vs unresolved failed interviews

**UI Changes in Table Row:**
```typescript
// In the renderRow function for failed interviews:
{interview.status === "Audit Failed" && (
  interview.artifact_correction_resolved_at ? (
    <Badge variant="secondary" className="gap-1 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
      <CheckCircle className="h-3 w-3" />
      Resolved
    </Badge>
  ) : (
    <Button
      variant="outline"
      size="sm"
      className="gap-1 border-orange-300 text-orange-600 hover:bg-orange-50"
      onClick={() => markAsResolvedMutation.mutate(interview.id)}
    >
      <Flag className="h-3 w-3" />
      Mark Resolved
    </Button>
  )
)}
```

**Add Filter Option:**
Add a filter option to show only "Failed - Unresolved" interviews.

---

## Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/components/payment/PaymentTable.tsx` | Modify | Fix useMemo to useEffect for page reset |
| `src/hooks/useAnnouncements.ts` | Modify | Add expiry/schedule filters, fix shouldShowAnnouncement logic |
| `src/components/announcements/AnnouncementProvider.tsx` | Modify | Add session storage tracking for every_login |
| `src/pages/InterviewTracking.tsx` | Modify | Add Mark as Resolved button and visual indicator, add filter |
| SQL Migration | Create | Add artifact_correction_resolved_at and artifact_correction_resolved_by columns |

---

## Implementation Sequence

1. **Fix Payment Table** - Replace useMemo with useEffect to prevent blank page
2. **Fix Announcement Visibility** - Update query and shouldShowAnnouncement logic
3. **Fix AnnouncementProvider** - Add session storage for every_login
4. **Database Migration** - Add resolved columns to audits table
5. **Add Mark as Resolved** - Update InterviewTracking with button and visual indicator
6. **Add Filter** - Add "Failed - Unresolved" filter option

---

## Visual Design for "Mark as Resolved" Feature

```text
Failed Interview Row (Before Resolving):
+---------------------------------------------------------------------------------+
| NG71_696_20251103 | Audit Failed | [Mark Resolved] | Action Plan | View Issue  |
+---------------------------------------------------------------------------------+
                                     ↑ Orange outline button

Failed Interview Row (After Resolving):
+---------------------------------------------------------------------------------+
| NG71_696_20251103 | Audit Failed | ✓ Resolved      | Action Plan | View Issue  |
+---------------------------------------------------------------------------------+
                                     ↑ Green badge with checkmark

Mobile Accordion (Failed & Unresolved):
+--------------------------------------------+
| NG71_696_20251103                     [v]  |
| Status: Audit Failed                       |
| [orange border highlight]                  |
| [Mark as Resolved] button                  |
+--------------------------------------------+

Mobile Accordion (Failed & Resolved):
+--------------------------------------------+
| NG71_696_20251103                     [v]  |
| Status: Audit Failed | ✓ Resolved          |
| [green subtle background]                  |
+--------------------------------------------+
```
