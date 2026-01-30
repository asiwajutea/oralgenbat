
# Implementation Plan: Team Assignments Performance Fix & Payment/Budget Tracking Feature

## Overview
This plan addresses two main requests:
1. **Bug Fix**: Team Assignments page loading slowly due to "400 Bad Request" errors from large `.in()` queries
2. **New Feature**: Payment & Budget Tracking page with PDF invoice parsing, interview journey tracking, and budget statistics

---

## Part 1: Team Assignments Page Performance Fix

### Problem
The console shows multiple `400 (Bad Request)` errors for audit queries. This is the same issue we fixed for ZIP Diagnostics - too many IDs (648 assignment IDs, 650+ audit IDs) are being passed to Supabase's `.in()` filter, which exceeds PostgreSQL's query parameter limits.

### Root Cause
Located in `src/hooks/useTeamAssignments.ts`:
- `useUnassignedInterviews()` at line 103-106: Passes `unassignedAuditIds` (hundreds of IDs) to `.in()` query
- `useAssignments()` at line 148-151: Passes `auditIds` (648 IDs) to `.in()` query

### Solution
Apply the same batching pattern used for ZIP Diagnostics:
- Batch IDs into chunks of 200
- Execute queries in parallel for each batch
- Combine results

### Files to Modify
- `src/hooks/useTeamAssignments.ts`

### Implementation Details
```typescript
// Helper function to batch queries
const batchQuery = async <T>(
  ids: string[],
  queryFn: (batch: string[]) => Promise<T[]>
): Promise<T[]> => {
  const BATCH_SIZE = 200;
  const results: T[] = [];
  
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const batchResults = await queryFn(batch);
    results.push(...batchResults);
  }
  
  return results;
};
```

Apply to both `useUnassignedInterviews` and `useAssignments` hooks.

---

## Part 2: Payment & Budget Tracking Feature

### Feature Requirements Summary

1. **New Page**: `/payment-tracking` accessible to all roles (filtered like InterviewTracking)
2. **PDF Upload**: Parse Self-Billing Invoice (SBI) PDFs to extract interview IDs and payment sections
3. **Payment Sections**:
   - New Interviews Processed (newly paid)
   - Deductions (reversed payments requiring rework)
   - Additions (reworked interviews with returned payments)
4. **Interview Display**: Separate interviews by assignment status (assigned to clerks vs unassigned)
5. **Journey Tracker**: Visual progress tracker for each interview:
   - Interview Submitted >> BAC Review Passed >> Transcribed >> Payment Received >> Booklet Printed >> Booklet Received >> Booklet Delivered
6. **Budget Statistics**:
   - Total names paid (including additions)
   - Total names deducted
   - Budget balance = Paid + Additions - Deductions
   - Include invoice entries not in database

### Database Schema Changes

Create a new table `payment_records` to store parsed invoice data:

```sql
CREATE TABLE payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  contractor_name TEXT,
  vendor_id TEXT,
  
  -- Interview reference
  folder_name TEXT NOT NULL, -- Maps to audits.file_name
  interview_id TEXT, -- External interview ID from invoice
  audit_id UUID REFERENCES audits(id), -- Linked audit if found
  
  -- Payment details
  payment_type TEXT NOT NULL CHECK (payment_type IN ('new_payment', 'addition', 'deduction')),
  names_count INTEGER NOT NULL,
  pay_rate DECIMAL(10,4),
  amount DECIMAL(10,2),
  
  -- Journey tracking
  journey_status TEXT DEFAULT 'payment_received',
  booklet_printed_at TIMESTAMP WITH TIME ZONE,
  booklet_received_at TIMESTAMP WITH TIME ZONE,
  booklet_delivered_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID,
  invoice_file_url TEXT,
  
  UNIQUE(invoice_number, folder_name)
);

-- Enable RLS
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

-- Policies (similar to interview_tracking)
CREATE POLICY "Approved users can view payment records"
  ON payment_records FOR SELECT
  USING (is_user_approved(auth.uid()));

CREATE POLICY "Admins can manage payment records"
  ON payment_records FOR ALL
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Contractors can insert payment records"
  ON payment_records FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'contractor') OR 
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'super_admin')
  );
```

### Invoice PDF Structure (from sample)
The SBI PDF contains:
- Header: Invoice Date, Contractor name, Vendor ID, Invoice Number
- **Section 1 - "New Interviews Processed"**: Table with Country, Folder Name, Date Accepted, Interview ID, Interviewer, Names, Pay Rate, Amount
- **Section 2 - "Deductions for Incorrect Prior Payments"**: Table with Country, Folder Name, Orig. Invoice, Date Failed, Interview ID, Interviewer, Names (negative), Pay Rate, Amount (negative)
- **Section 3 - "Additions"**: Table with Country, Folder Name, Ded. Invoice, Date Passed, Interview ID, Interviewer, Names, Pay Rate, Amount
- Totals: Subtotals per section, Grand Total

### Edge Function for PDF Parsing

Create `supabase/functions/parse-invoice-pdf/index.ts`:

1. Accept PDF file upload
2. Use pdfjs or a simple text extraction approach (the PDF appears to have structured tables)
3. Parse each section using regex patterns:
   - Identify section headers ("New Interviews Processed", "Deductions", "Additions")
   - Extract table rows with folder names (e.g., `NG71_696_20251103_1035`)
   - Extract names count, amounts
4. Return structured JSON with:
```typescript
interface ParsedInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  contractor: string;
  vendorId: string;
  newPayments: { folderName: string; interviewId: string; names: number; amount: number }[];
  additions: { folderName: string; interviewId: string; names: number; amount: number }[];
  deductions: { folderName: string; interviewId: string; names: number; amount: number }[];
  totals: { newPayments: number; additions: number; deductions: number; grandTotal: number };
}
```

### Frontend Components

#### New Files to Create:

1. **`src/pages/PaymentTracking.tsx`** - Main page component
   - Budget stat cards at top
   - PDF upload dialog (admin/contractor only)
   - Interview table with tabs (Assigned to Clerks | Unassigned)
   - Search and filters (like InterviewTracking)
   - Journey status visual tracker

2. **`src/components/payment/InvoiceUploadDialog.tsx`**
   - Drag & drop PDF upload
   - Preview parsed data before confirming
   - Show matches found in database

3. **`src/components/payment/BudgetStatsCard.tsx`**
   - Total names paid
   - Names in additions
   - Names deducted
   - Budget balance

4. **`src/components/payment/InterviewJourneyTracker.tsx`**
   - Visual horizontal stepper showing:
     - Interview Submitted (completed if audit exists)
     - BAC Review Passed (completed if status = "Audit Passed")
     - Transcribed (completed if assigned to team)
     - Payment Received (completed if in payment_records with type new_payment)
     - Booklet Printed (manual update)
     - Booklet Received (manual update)
     - Booklet Delivered (manual update)
   - Each step shows date if completed
   - Animated progress indicators

5. **`src/hooks/usePaymentTracking.ts`**
   - `usePaymentRecords()` - fetch payment data
   - `usePaymentStats()` - calculate budget totals
   - `useUploadInvoice()` - mutation for invoice upload

#### Route Configuration
Add to `src/App.tsx`:
```typescript
<Route
  path="/payment-tracking"
  element={
    <ProtectedRoute>
      <TrackingRoute>
        <Layout>
          <PaymentTracking />
        </Layout>
      </TrackingRoute>
    </ProtectedRoute>
  }
/>
```

### Journey Tracker UI Design

The visual journey tracker will be a beautiful horizontal stepper with:
- Circular step indicators with icons
- Connecting lines showing progress
- Color coding: Completed (green), Current (blue), Pending (gray)
- Tooltip showing completion date on hover
- Mobile-responsive (stacks vertically on small screens)

```text
     (1)----------(2)----------(3)----------(4)----------(5)----------(6)----------(7)
   Submitted   BAC Passed   Transcribed   Payment     Booklet     Booklet     Booklet
                                         Received    Printed     Received    Delivered
```

### Access Control

| Role | View Data | Upload Invoice | Update Journey Status |
|------|-----------|----------------|----------------------|
| Super Admin | All | Yes | Yes |
| Admin | Assigned FMs | Yes | Yes |
| Contractor | Own contractor | Yes | No |
| Sub-Contractor | Assigned FMs | No | No |
| Field Manager | Own team | No | No |

---

## Summary of Files to Create/Modify

### Bug Fix (Part 1)
| File | Changes |
|------|---------|
| `src/hooks/useTeamAssignments.ts` | Add batching to `useUnassignedInterviews` and `useAssignments` |

### New Feature (Part 2)
| File | Type | Purpose |
|------|------|---------|
| SQL Migration | Create | `payment_records` table with RLS |
| `supabase/functions/parse-invoice-pdf/index.ts` | Create | Parse SBI PDF files |
| `src/pages/PaymentTracking.tsx` | Create | Main payment tracking page |
| `src/components/payment/InvoiceUploadDialog.tsx` | Create | PDF upload modal |
| `src/components/payment/BudgetStatsCard.tsx` | Create | Budget statistics display |
| `src/components/payment/InterviewJourneyTracker.tsx` | Create | Visual journey stepper |
| `src/hooks/usePaymentTracking.ts` | Create | Payment data hooks |
| `src/App.tsx` | Modify | Add route for `/payment-tracking` |
| `src/components/Layout.tsx` or navigation | Modify | Add nav link |

---

## Technical Implementation Notes

### Folder Name Matching
The invoice uses "Folder Name" (e.g., `NG71_696_20251103_1035`) which maps to `audits.file_name`. When parsing:
1. Extract folder name from invoice
2. Query `audits` table to find matching record
3. If found, link via `audit_id`
4. If not found, still store the payment record (for budget calculations)

### Budget Calculation
```typescript
const budget = {
  totalPaid: sum of (new_payments.names + additions.names),
  totalDeducted: sum of deductions.names,
  balance: totalPaid - totalDeducted,
  // Include entries not in database
  unmatchedPaid: new_payments where audit_id is null,
  unmatchedDeducted: deductions where audit_id is null
};
```

### PDF Parsing Strategy
Since the SBI PDF has structured tables, we can:
1. Use Lovable AI (Gemini) to extract structured data from the PDF
2. The model can identify sections and parse table rows
3. Return JSON matching our interface
