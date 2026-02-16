

## Payment Page Improvements

### 1. Allow Saving Unmatched Folder Names in Manual Invoice Entry

**File: `src/components/payment/ManualInvoiceEntryDialog.tsx`**

Currently, the save function filters out folder names not found in the database (`previewRecords.filter(r => r.found)`), making it impossible to save them. Changes:

- Remove the `r.found` filter from `handleSave` -- save ALL entered folder names, whether found in the database or not
- For not-found records, save with `audit_id: null` and use the edited names count (or 0 if not edited)
- Allow editing the names count on not-found rows (currently disabled with `disabled={!record.found}`)
- Update the save button text to show total records count instead of only found count
- Change the warning message from "will be skipped" to an informational note that unmatched records will be saved without a linked interview

### 2. Budget Stats Use Payment Record's `names_count` Directly

**File: `src/hooks/usePaymentTracking.ts`**

The `useBudgetStats` hook already sums `names_count` from `payment_records` table directly. This is correct behavior. However, the stat cards ("Total Names Paid") currently show this sum correctly. The key fix is ensuring:

- When a manual invoice entry saves with an edited total names override, the `names_count` stored in the payment record reflects that override
- Currently the dialog saves each folder as a separate payment record with its individual `names_count`. When the user edits the "Total Names" override, that override is not actually used during save -- each record saves its own count. We need to distribute the total override across records OR save a single aggregated record per invoice

**Approach**: When `totalNamesOverride` is set, save a single payment record per invoice with the overridden total as `names_count` and a combined folder name. This way the stat cards (which sum `names_count`) will show the correct edited total.

Actually, simpler approach: save all records individually, but if `totalNamesOverride` is set, proportionally distribute the override across records. If there's only unmatched records with 0 names each, just assign the full override to the first record.

### 3. Invoice History Tab

**File: `src/pages/PaymentTracking.tsx`**

Add a third tab "Invoice History" alongside "Assigned to Clerks" and "Not Assigned":

- Shows all invoices grouped by `invoice_number`
- Each row displays: invoice number, date created, payment category, number of folder names, total names count, contractor name
- Expandable rows showing individual folder entries within each invoice
- Edit button to modify the `names_count` or `payment_type` of each record
- Delete option for individual records or entire invoices
- Mobile-friendly accordion layout

**New file: `src/components/payment/InvoiceHistoryTab.tsx`**

A new component that:
- Queries `payment_records` grouped by `invoice_number`
- Displays invoices in a table/accordion layout
- Allows inline editing of `names_count` per record
- Allows editing the payment type
- Has delete functionality for records
- Uses existing mutations from `usePaymentTracking.ts`

**File: `src/hooks/usePaymentTracking.ts`**

Add new mutations:
- `useUpdatePaymentRecord` -- update `names_count`, `payment_type` on a payment record
- `useDeletePaymentRecord` -- delete a payment record by ID

### Technical Summary

| File | Change |
|------|--------|
| `src/components/payment/ManualInvoiceEntryDialog.tsx` | Allow saving not-found folder names, enable names editing on all rows, distribute total override |
| `src/hooks/usePaymentTracking.ts` | Add `useUpdatePaymentRecord` and `useDeletePaymentRecord` mutations |
| `src/components/payment/InvoiceHistoryTab.tsx` | New component: invoice history with edit/delete |
| `src/pages/PaymentTracking.tsx` | Add "Invoice History" tab |

