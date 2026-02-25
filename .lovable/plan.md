

## Plan: SMS Logs PDF Report + Pagination, and Fix Push Notification Delivery

This plan addresses two areas: adding a PDF report and pagination to the SMS Logs page, and fixing the web push notification delivery issue.

---

### 1. SMS Logs: PDF Report Download (Filtered)

**File: `src/pages/SmsLogs.tsx`**

Add a "Download PDF Report" button next to the Refresh button. The report will use the current filters and contain:

**Report structure (using jsPDF, already installed):**
- **Header**: "SMS Notification Report" + date range + filter info
- **Section 1 - Contractor Summary Table**: For each contractor (and an "All" total row): contractor ID, total SMS count, successful count, failed count
- **Section 2 - Interviewer Summary Table**: Each unique interviewer code with their total SMS count
- **Section 3 - Detailed Breakdown**: Grouped by interviewer code, listing each interview (file_name) with the date/time the failure SMS was triggered and status

**Data source**: The report will fetch ALL matching records (not just the paginated view) using `fetchAllRows` from `@/utils/paginatedFetch`, applying the same filters currently active.

**Changes:**
- Import `jsPDF` and `fetchAllRows`
- Add `generatePdfReport()` function that:
  1. Fetches all filtered SMS logs (bypassing the current 100-row limit)
  2. Groups data by contractor, then by interviewer
  3. Renders tables using jsPDF's text/line drawing (similar to the existing `generateFraudReportPdf.ts` pattern)
- Add download button in the header area

---

### 2. SMS Logs: Pagination

**File: `src/pages/SmsLogs.tsx`**

Currently the page fetches 100 rows with `.limit(100)` and shows all in one table. Convert to server-side pagination using the existing `AuditPagination` component pattern.

**Changes:**
- Add `currentPage` and `itemsPerPage` state variables
- Replace the `.limit(100)` with proper `.range()` pagination
- Add a count query to get `totalCount` for the current filters
- Import and render `AuditPagination` below the table
- Reset page to 1 when filters change

---

### 3. Fix Push Notification: Web Push Encryption

The test push button inserts a record into `push_notifications`, which triggers `notify_push_notification()` → calls the `send-web-push` edge function. The edge function currently sends the payload as **plain unencrypted JSON** to the push endpoint. This violates the Web Push protocol (RFC 8291) which **requires** content encryption using the subscription's `p256dh` and `auth` keys.

All major push services (Google FCM, Mozilla autopush, Apple) reject unencrypted payloads, returning 400 or similar errors. This is why the push appears to succeed (the DB insert works, the edge function is called) but no actual browser notification arrives.

**File: `supabase/functions/send-web-push/index.ts`**

Complete rewrite of the `sendPush` function to implement proper RFC 8291 (aes128gcm) encryption:

1. **ECDH key agreement**: Generate an ephemeral ECDH P-256 key pair, derive shared secret using the subscription's `p256dh` public key
2. **HKDF key derivation**: Derive content encryption key (CEK) and nonce from the shared secret, the subscription's `auth` secret, and the ephemeral public key
3. **AES-128-GCM encryption**: Encrypt the payload with the derived CEK and nonce
4. **Proper headers**: Set `Content-Encoding: aes128gcm` and `Content-Type: application/octet-stream` instead of `application/json`

The VAPID JWT signing (already implemented) will remain unchanged. Only the payload delivery mechanism changes.

Additionally, simplify the `importVapidPrivateKey` function - the current approach of parsing the public key to extract x/y coordinates has potential byte-offset bugs. Instead, import the private key as a raw JWK using only the `d` parameter and derive x/y from the VAPID public key stored as a separate secret.

---

### Technical Summary

| Area | File | Change |
|------|------|--------|
| SMS PDF Report | `src/pages/SmsLogs.tsx` | Add PDF generation with contractor/interviewer/interview breakdown using jsPDF |
| SMS Pagination | `src/pages/SmsLogs.tsx` | Add server-side pagination with AuditPagination component, count query |
| Push Fix | `supabase/functions/send-web-push/index.ts` | Implement RFC 8291 aes128gcm encryption for Web Push payloads |

