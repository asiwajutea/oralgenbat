
# Implementation Plan: Enhanced Payment Status Management

## Overview
This plan adds three major capabilities to the Payment Tracking page:
1. **Manual Payment Status Updates** - Update interviews to "Payment Received" or "Payment Revoked (Rework)" with bulk support
2. **Manual Text-Based Invoice Entry** - Input multiple folder names via text field (comma, space, or newline separated) and assign payment types
3. **Combined Upload Dialog** - A unified dialog offering both PDF upload and manual text entry options

---

## Part 1: Manual Payment Status Updates for Assigned Interviews

### Current Behavior
The `BulkJourneyUpdateDialog` only allows updating journey stages (Booklet Printed/Received/Delivered) for records that already have payment records.

### Required Changes

**Modify `BulkJourneyUpdateDialog.tsx`:**
- Add new payment status options:
  - "Payment Received" (creates/updates payment record with type `new_payment`)
  - "Payment Revoked (Rework)" (creates/updates payment record with type `deduction`)
- Handle interviews without existing payment records by creating new ones
- Group options into two sections: "Payment Status" and "Booklet Journey"

**New Options Structure:**
```typescript
const PAYMENT_OPTIONS = [
  { id: "payment_received", label: "Mark as Payment Received", icon: DollarSign, type: "new_payment" },
  { id: "payment_revoked", label: "Mark as Payment Revoked (Rework)", icon: RotateCcw, type: "deduction" },
];

const JOURNEY_STAGES = [
  { id: "booklet_printed_at", label: "Booklet Printed", icon: Printer },
  { id: "booklet_received_at", label: "Booklet Received", icon: Package },
  { id: "booklet_delivered_at", label: "Booklet Delivered", icon: Truck },
];
```

**New Hook: `useCreateOrUpdatePaymentStatus`**
Add to `usePaymentTracking.ts`:
```typescript
export const useCreateOrUpdatePaymentStatus = () => {
  return useMutation({
    mutationFn: async ({ 
      auditId, 
      folderName, 
      paymentType,
      namesCount,
      contractorId
    }: {
      auditId: string;
      folderName: string;
      paymentType: "new_payment" | "deduction" | "addition";
      namesCount: number;
      contractorId?: string;
    }) => {
      // Check if payment record exists for this folder
      const { data: existing } = await supabase
        .from("payment_records")
        .select("id")
        .eq("folder_name", folderName)
        .maybeSingle();

      if (existing) {
        // Update existing record
        await supabase
          .from("payment_records")
          .update({ payment_type: paymentType })
          .eq("id", existing.id);
      } else {
        // Create new record
        await supabase
          .from("payment_records")
          .insert({
            folder_name: folderName,
            audit_id: auditId,
            payment_type: paymentType,
            names_count: namesCount || 0,
            invoice_number: `MANUAL-${Date.now()}`,
            invoice_date: new Date().toISOString().split('T')[0],
          });
      }
    },
  });
};
```

---

## Part 2: Manual Text-Based Invoice Entry Dialog

### New Component: `ManualInvoiceEntryDialog.tsx`

A dialog that allows users to:
1. Type or paste multiple folder names (comma, space, or newline separated)
2. Select the payment category (New Payment, Addition, Deduction)
3. Preview matched interviews with their names count with the ability to manually override the total names.
4. Confirm and save

**UI Layout:**
```text
+--------------------------------------------------+
|  Manual Invoice Entry                            |
|--------------------------------------------------|
|  Enter folder names (one per line, or comma/     |
|  space separated):                               |
|  +--------------------------------------------+  |
|  | NG71_696_20251103_1035                     |  |
|  | NG71_697_20251103_1040                     |  |
|  | NG71_698_20251103_1045                     |  |
|  +--------------------------------------------+  |
|                                                  |
|  Payment Category:                               |
|  [Dropdown: New Payment / Addition / Deduction]  |
|                                                  |
|  Invoice Number (optional):                      |
|  [_________________________________]             |
|                                                  |
|  ----- Preview -----                             |
|  Found: 45 interviews                            |
|  Not Found: 3 folder names                       |
|  Total Names: 1,234                              |
|                                                  |
|  [Preview Details]                               |
|  +------------------------------------------+    |
|  | Folder Name         | Names | Status    |    |
|  | NG71_696...         | 28    | Found     |    |
|  | NG71_697...         | 35    | Found     |    |
|  | NG71_INVALID        | -     | Not Found |    |
|  +------------------------------------------+    |
|                                                  |
|  [Cancel]                    [Save XX Records]   |
+--------------------------------------------------+
```

**Component Props:**
```typescript
interface ManualInvoiceEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}
```

**Parsing Logic:**
```typescript
const parseInput = (input: string): string[] => {
  // Split by newlines, commas, or multiple spaces
  return input
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
};
```

**Matching Logic:**
1. Take folder names list
2. Query `audits` table to match by `file_name`
3. Get `interview_metadata` for names count
4. Display matched vs unmatched

---

## Part 3: Combined Upload Dialog

### Modify Page to Use Tabs/Options

Update `PaymentTracking.tsx` to show a unified "Add Payment Data" button that opens a dialog with two options:
1. **Upload Invoice PDF** - existing functionality
2. **Manual Entry** - new text-based entry

**Option A: Single Combined Dialog with Tabs**
```typescript
<CombinedUploadDialog open={dialogOpen} onOpenChange={setDialogOpen}>
  <Tabs defaultValue="pdf">
    <TabsList>
      <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
      <TabsTrigger value="manual">Manual Entry</TabsTrigger>
    </TabsList>
    <TabsContent value="pdf">
      {/* Existing PDF upload UI */}
    </TabsContent>
    <TabsContent value="manual">
      {/* New manual entry UI */}
    </TabsContent>
  </Tabs>
</CombinedUploadDialog>
```

**Option B: Dropdown Button** (Recommended for cleaner UX)
```typescript
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button>
      <Upload className="h-4 w-4 mr-2" />
      Add Payment Data
      <ChevronDown className="h-4 w-4 ml-2" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={() => setPdfDialogOpen(true)}>
      <FileText className="h-4 w-4 mr-2" />
      Upload Invoice PDF
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => setManualDialogOpen(true)}>
      <Edit className="h-4 w-4 mr-2" />
      Manual Entry
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## Part 4: RLS Policy Update

Add UPDATE policy for contractors on `payment_records`:
```sql
CREATE POLICY "Contractors can update journey status"
  ON payment_records FOR UPDATE
  USING (
    has_role(auth.uid(), 'contractor') OR 
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'super_admin')
  );
```

---

## Files to Create/Modify

| File | Type | Purpose |
|------|------|---------|
| `src/components/payment/BulkJourneyUpdateDialog.tsx` | Modify | Add payment status options (Received/Revoked) |
| `src/components/payment/ManualInvoiceEntryDialog.tsx` | Create | New text-based entry dialog |
| `src/components/payment/CombinedUploadDialog.tsx` | Create | Wrapper with PDF + Manual tabs |
| `src/hooks/usePaymentTracking.ts` | Modify | Add `useCreateOrUpdatePaymentStatus` and `useBulkCreatePayments` hooks |
| `src/pages/PaymentTracking.tsx` | Modify | Use combined dialog with dropdown button |
| SQL Migration | Create | Add UPDATE policy for contractors |

---

## Data Flow for Manual Entry

```text
User enters folder names
        ↓
Parse input (split by comma/space/newline)
        ↓
Query audits table for matches
        ↓
Fetch interview_metadata for names count
        ↓
Display preview with matched/unmatched
        ↓
User selects payment type
        ↓
User confirms
        ↓
Create payment_records for each match
        ↓
Refresh data & close dialog
```

---

## Technical Implementation Details

### 1. Folder Name Validation
```typescript
// Valid formats: NG71_696_20251103_1035
const FOLDER_NAME_PATTERN = /^[A-Z]{2}\d{2}_\d+_\d{8}_\d{4}$/;

const validateFolderName = (name: string): boolean => {
  return FOLDER_NAME_PATTERN.test(name);
};
```

### 2. Batch Insert for Manual Entry
```typescript
const useBulkCreatePayments = () => {
  return useMutation({
    mutationFn: async (entries: {
      folder_name: string;
      audit_id: string | null;
      names_count: number;
      payment_type: "new_payment" | "addition" | "deduction";
      invoice_number: string;
    }[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const records = entries.map(e => ({
        ...e,
        invoice_date: new Date().toISOString().split('T')[0],
        created_by: user?.id,
      }));
      
      const { error } = await supabase
        .from("payment_records")
        .upsert(records, { 
          onConflict: "invoice_number,folder_name,payment_type",
          ignoreDuplicates: false 
        });
        
      if (error) throw error;
    },
  });
};
```

### 3. Preview Component
Show a scrollable list with:
- Green checkmark for matched folders
- Red X for unmatched folders
- Names count from metadata
- Warning for folders without audit records
