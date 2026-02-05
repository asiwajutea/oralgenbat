
# Implementation Plan: Payment Tracking Enhancements, Announcements Integration & SMS Log Filters

## Overview

This plan addresses multiple improvements across different pages:

1. **Payment Tracking Page**
   - Mobile-optimized collapsible accordion view
   - Journey tracker status reflection fixes
   - Stat card calculation using overridden total names
   - Comprehensive filters and pagination improvements
   - Journey status display on tracking page

2. **Homepage & Announcements**
   - Add unread announcement count + Notice Board navigation
   - Fix announcement notifications not appearing in NotificationBell
   - Trigger push notifications when announcements are posted

3. **SMS Logs Page**
   - Advanced comprehensive filters with date range
   - Filter counter badge
   - Additional sorting options

---

## Part 1: Payment Tracking - Mobile Accordion View

### Problem
The table layout doesn't fit well on mobile screens and requires horizontal scrolling.

### Solution
Create a mobile-responsive accordion view similar to Team Management and Interview Tracking pages.

**Modify `PaymentTable.tsx`:**
- Add `useIsMobile()` hook
- Render table on desktop, accordion on mobile
- Each accordion item shows folder name in header, expands to show journey tracker and details

**Mobile Accordion Structure:**
```text
+--------------------------------------------+
| [checkbox] NG71_696_20251103_1035      [v] |
+--------------------------------------------+
| Status: Audit Passed                       |
| Names: 28                                  |
| Team: Team Alpha                           |
| Payment: INV-2025-001 ($56.00)             |
|                                            |
| Journey:                                   |
| [○ → ○ → ○ → ● → ○ → ○ → ○]                |
| Submitted → BAC → Trans → Pay → Print...  |
+--------------------------------------------+
```

---

## Part 2: Journey Tracker Status Fix

### Problem
Payment status updates are not reflecting on the journey tracker because `paymentReceivedAt` is checking for `record.payment.id` instead of properly detecting payment status.

### Current Code (Incorrect):
```typescript
paymentReceivedAt: record.payment?.payment_type === "new_payment" ? record.payment.id : null,
```

### Fix:
The condition checks `payment_type === "new_payment"` but the ID is not a timestamp. For the journey tracker to show completion, we need to pass a truthy value (not null) when payment exists.

**Update `createJourneySteps` call in `PaymentTable.tsx`:**
```typescript
// Payment is considered "received" if payment record exists with new_payment or addition type
// Revoked (deduction) should NOT show as payment received
paymentReceivedAt: record.payment && record.payment.payment_type !== "deduction" 
  ? record.payment.id  // Any truthy value works for "completed" status
  : null,
```

---

## Part 3: Stat Card with Overridden Total Names

### Problem
The `useBudgetStats` hook sums `names_count` from `payment_records` but doesn't account for manually overridden totals.

### Solution
The current implementation already uses `names_count` from payment_records. If users are manually overriding totals in `ManualInvoiceEntryDialog`, we need to ensure those overridden values are saved to `payment_records.names_count`.

**Verify in `ManualInvoiceEntryDialog.tsx`:**
The dialog should use `totalNamesOverride` when creating records. If override exists, distribute proportionally or use as aggregate:
```typescript
// When saving, if totalNamesOverride is set:
// Option 1: Store as a single record with the override
// Option 2: Adjust individual records proportionally
```

**Add invoice-level override storage:**
Currently, individual records have `names_count`. For invoice-level override, we could:
1. Store aggregate in a new `invoice_metadata` table, OR
2. Use a single aggregate payment_record with the total, OR  
3. Proportionally distribute the override across records

Recommended: Store the total as a metadata field on the payment_records created from that manual entry session, using `totalNamesOverride` divided proportionally.

---

## Part 4: Comprehensive Filters & Pagination

### Add Filters to `PaymentTracking.tsx`

**New Filter State:**
```typescript
const [filters, setFilters] = useState({
  paymentStatus: "", // new_payment, deduction, addition, no_payment
  journeyStatus: "", // payment_received, booklet_printed, etc.
  entryStatus: "", // typing_in_progress, completed
  sortField: "file_name",
  sortOrder: "desc" as "asc" | "desc",
});
const [showFilters, setShowFilters] = useState(false);
```

**Filter UI (Collapsible):**
- Payment Status dropdown (All, Payment Received, Payment Revoked, Additions, No Payment)
- Journey Stage dropdown (All stages)
- Entry Status dropdown (Typing In Progress, Completed)
- Sort By dropdown with order toggle
- Active filter counter badge

**Replace current pagination with `AuditPagination` component:**
- Import and use `AuditPagination` from `@/components/AuditPagination`
- Add items per page selector (10, 25, 50, 100)
- Match the interviews page pagination style

---

## Part 5: Journey Status Display Column

### Problem
The "Status" column shows audit status, not journey status.

### Solution
Add a new column or modify the status badge to show current journey stage:

**Derive journey status from data:**
```typescript
const getJourneyStatus = (record: PaymentInterviewRecord): string => {
  if (record.payment?.booklet_delivered_at) return "Booklet Delivered";
  if (record.payment?.booklet_received_at) return "Booklet Received";
  if (record.payment?.booklet_printed_at) return "Booklet Printed";
  if (record.payment && record.payment.payment_type !== "deduction") return "Payment Received";
  if (record.assignment) return "Transcribed";
  if (record.status === "Audit Passed") return "BAC Passed";
  return "Submitted";
};
```

Display this in the table/accordion as "Journey Status" badge.

---

## Part 6: Homepage - Announcement Count & Navigation

### Problem
Homepage doesn't show unread announcements or link to Notice Board.

### Solution
**Add to dashboard components (AdminDashboard, ContractorDashboard, etc.):**
- Query unread announcements count using `useAnnouncements().pendingAnnouncements.length`
- Add a Notice Board card/button in Quick Actions

**Sample UI in AdminDashboard.tsx:**
```typescript
import { useAnnouncements } from "@/hooks/useAnnouncements";
import { Megaphone } from "lucide-react";

// In component:
const { pendingAnnouncements } = useAnnouncements();
const unreadNoticesCount = pendingAnnouncements.length;

// In Quick Actions:
<Button 
  variant="outline" 
  className="w-full justify-between"
  onClick={() => navigate("/notices")}
>
  <span className="flex items-center gap-2">
    <Megaphone className="h-4 w-4" />
    Notice Board
  </span>
  {unreadNoticesCount > 0 && (
    <Badge variant="secondary">{unreadNoticesCount}</Badge>
  )}
  <ArrowRight className="h-4 w-4" />
</Button>
```

---

## Part 7: Announcement Notifications

### Problem
1. Announcements not showing in NotificationBell
2. No push notification when announcement is posted

### Root Cause
When an announcement is created, no `user_notification` record is inserted for targeted users.

### Solution
**Add database trigger or modify `createAnnouncement` mutation:**

Option A: Database Trigger (preferred for reliability)
```sql
CREATE OR REPLACE FUNCTION notify_new_announcement()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notification for all targeted users
  INSERT INTO user_notifications (user_id, type, title, message, metadata)
  SELECT 
    p.id,
    'announcement',
    'New Announcement: ' || NEW.title,
    LEFT(NEW.content, 100) || '...',
    jsonb_build_object('announcement_id', NEW.id)
  FROM profiles p
  INNER JOIN user_roles ur ON ur.user_id = p.id
  WHERE p.is_approved = true
  AND (
    NEW.target_type = 'all' OR
    (NEW.target_type = 'contractor' AND (p.contractor_id = NEW.target_contractor_id OR p.active_contractor_id = NEW.target_contractor_id)) OR
    (NEW.target_type = 'role' AND ur.role = NEW.target_role) OR
    (NEW.target_type = 'user' AND p.id = ANY(NEW.target_user_ids))
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_announcement_created
  AFTER INSERT ON announcements
  FOR EACH ROW
  WHEN (NEW.is_active = true AND (NEW.scheduled_at IS NULL OR NEW.scheduled_at <= now()))
  EXECUTE FUNCTION notify_new_announcement();
```

Option B: Modify `useAnnouncements.createAnnouncement` to insert notifications after creation (less reliable but simpler)

---

## Part 8: SMS Logs Advanced Filters

### Current State
Basic search + status filter only.

### Add Features:

**New Filter State in `SmsLogs.tsx`:**
```typescript
const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
  from: undefined,
  to: undefined,
});
const [sortField, setSortField] = useState<"created_at" | "recipients_count">("created_at");
const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
```

**Filter UI:**
- Date range picker (from/to)
- Contractor filter dropdown
- Sort by dropdown (Date, Recipients Count)
- Sort order toggle
- **Filter Counter Badge:** Shows count of active filters

**Active Filters Counter:**
```typescript
const activeFilterCount = useMemo(() => {
  let count = 0;
  if (statusFilter !== "all") count++;
  if (searchQuery) count++;
  if (dateRange.from || dateRange.to) count++;
  return count;
}, [statusFilter, searchQuery, dateRange]);
```

Display badge next to "Filters" button showing active count.

**Updated Query:**
```typescript
let query = supabase
  .from("sms_notification_logs")
  .select("*")
  .order(sortField, { ascending: sortOrder === "asc" })
  .limit(100);

if (statusFilter !== "all") query = query.eq("status", statusFilter);
if (dateRange.from) query = query.gte("created_at", dateRange.from.toISOString());
if (dateRange.to) query = query.lte("created_at", dateRange.to.toISOString());
if (searchQuery) query = query.or(`...`);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/payment/PaymentTable.tsx` | Mobile accordion, journey status fix, journey status column, pagination update |
| `src/pages/PaymentTracking.tsx` | Add filters UI, filter state, collapsible filter section |
| `src/hooks/usePaymentTracking.ts` | Update budget stats to work with overridden totals (if needed) |
| `src/components/payment/ManualInvoiceEntryDialog.tsx` | Ensure totalNamesOverride is properly saved |
| `src/components/home/AdminDashboard.tsx` | Add Notice Board navigation with count |
| `src/components/home/ContractorDashboard.tsx` | Add Notice Board navigation with count |
| `src/components/home/SubContractorDashboard.tsx` | Add Notice Board navigation with count |
| `src/components/home/QAManagerDashboard.tsx` | Add Notice Board navigation with count |
| `src/pages/SmsLogs.tsx` | Advanced filters, date range, sorting, filter counter |
| SQL Migration | Add trigger for announcement notifications |

---

## Implementation Sequence

1. **Payment Table Mobile Accordion** - Responsive design with collapsible items
2. **Journey Tracker Fix** - Correct payment status detection
3. **Payment Filters & Pagination** - Add comprehensive filtering with AuditPagination
4. **Journey Status Column** - Display current journey stage
5. **Stat Card Override** - Ensure overridden totals reflect correctly
6. **Homepage Notice Board Links** - Add navigation + count to dashboards
7. **Announcement Notifications** - Create trigger for user_notifications
8. **SMS Log Filters** - Date range, sorting, filter counter

---

## Technical Details

### Mobile Accordion Item Component
```typescript
const MobilePaymentCard = ({ record, selected, onToggle }: { ... }) => {
  const journeyStatus = getJourneyStatus(record);
  const journeySteps = createJourneySteps({ ... });
  
  return (
    <AccordionItem value={record.id}>
      <div className="flex items-center gap-2 p-2">
        <Checkbox checked={selected} onCheckedChange={onToggle} />
        <AccordionTrigger className="flex-1 hover:no-underline">
          <div className="flex items-center justify-between w-full">
            <span className="font-mono text-sm">{record.file_name}</span>
            <Badge variant="outline" className="text-xs">{journeyStatus}</Badge>
          </div>
        </AccordionTrigger>
      </div>
      <AccordionContent className="px-4 pb-4">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Status:</span>
              <Badge>{record.status}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Names:</span> 
              {record.total_names || "-"}
            </div>
            {/* ... more fields */}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Journey Progress</p>
            <InterviewJourneyTracker steps={journeySteps} />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
```

### Filter Counter Badge
```typescript
<Button 
  variant="outline" 
  onClick={() => setShowFilters(!showFilters)}
  className="gap-2"
>
  <Filter className="h-4 w-4" />
  Filters
  {activeFilterCount > 0 && (
    <Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>
  )}
</Button>
```
