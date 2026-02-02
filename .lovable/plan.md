
# Implementation Plan: Show All Interviews on Payment Tracking Page

## Overview
Modify the Payment Tracking page to display all interviews from the `audits` table, separated into two tabs:
- **Assigned to Clerks**: Interviews with records in `interview_assignments`
- **Not Assigned**: Interviews without assignment records

## Current Behavior
The page queries `payment_records` table and enriches with audit/assignment data. This only shows interviews that have appeared on invoices.

## Desired Behavior
The page should show ALL interviews from `audits` table, regardless of whether they have payment records. Payment info should be enriched if available.

---

## Changes Required

### 1. Update `usePaymentTracking.ts` Hook

Create a new hook `useAllInterviewsForPayment` that:
1. Fetches all audits with their metadata (similar to InterviewTracking)
2. Fetches all interview_assignments to determine assigned vs unassigned
3. Left-joins payment_records data if available
4. Returns unified record type

**New Data Flow:**
```
audits (all) 
  + LEFT JOIN interview_metadata
  + LEFT JOIN interview_assignments 
  + LEFT JOIN payment_records (by folder_name)
```

**New Interface:**
```typescript
export interface PaymentInterviewRecord {
  // From audit
  id: string;
  file_name: string;
  status: string;
  reviewed_at: string | null;
  
  // From metadata
  total_names: number | null;
  interviewer_code: string | null;
  contractor_id: string | null;
  interviewee_name: string | null;
  
  // From assignment (null if not assigned)
  assignment: {
    id: string;
    team_id: string;
    team_name: string | null;
    assigned_at: string | null;
    entry_status: string | null;
  } | null;
  
  // From payment_records (null if not on any invoice)
  payment: {
    id: string;
    invoice_number: string;
    payment_type: string;
    names_count: number;
    amount: number | null;
    booklet_printed_at: string | null;
    booklet_received_at: string | null;
    booklet_delivered_at: string | null;
  } | null;
}
```

### 2. Update `PaymentTracking.tsx` Page

**Modify data fetching:**
- Use new `useAllInterviewsForPayment()` hook instead of `useEnrichedPaymentRecords()`
- Apply same role-based filtering as InterviewTracking

**Update table rendering:**
- Adjust columns to show relevant data for interviews without payment records
- Show "No payment" or similar for interviews not yet on invoices
- Journey tracker should show early stages even without payment

**Update tab separation logic:**
```typescript
const assignedInterviews = records.filter(r => r.assignment !== null);
const unassignedInterviews = records.filter(r => r.assignment === null);
```

### 3. Update Journey Tracker Logic

Modify `createJourneySteps` to handle interviews without payment records:
- Submitted: Based on audit existence (always true)
- BAC Passed: Based on audit status = "Audit Passed"
- Transcribed: Based on assignment existence
- Payment Received: Based on payment record existence
- Booklet stages: Based on payment record timestamps (or null)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/usePaymentTracking.ts` | Add `useAllInterviewsForPayment` hook |
| `src/pages/PaymentTracking.tsx` | Use new hook, update UI rendering |

---

## Technical Details

### Query Strategy (with batching)
```typescript
// 1. Fetch all audits with metadata
const { data: audits } = await supabase
  .from("audits")
  .select(`
    id, file_name, status, reviewed_at,
    interview_metadata(total_names, interviewer_code, contractor_id, interviewee_name)
  `)
  .limit(5000);

// 2. Batch fetch assignments
const assignmentMap = await batchedQuery(auditIds, "interview_assignments", "audit_id");

// 3. Batch fetch payment records by folder_name
const paymentMap = await batchedQuery(folderNames, "payment_records", "folder_name");

// 4. Combine and return
```

### Role-Based Filtering
Apply the same filtering logic from InterviewTracking:
- Super Admin: See all
- Contractor: Filter by contractor_id
- Admin: Filter by assigned field managers
- Field Manager: Filter by team assignments
