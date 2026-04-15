

## Comprehensive Security & Stability Audit Report

After scanning every edge function, RLS policy, client-side page, and data flow, here are all findings organized by severity.

---

### CRITICAL — Security Vulnerabilities (Exploitable Now)

**1. Storage Buckets Are Fully Public (Read + Write)**
All 4 storage buckets (`audit-pdfs`, `mobile-zips`, `interview-photos`, `interview-audio`) are set to **public** with no authentication on SELECT or INSERT. Anyone on the internet can:
- Download all audit PDFs, ZIP files, photos, and audio recordings
- Upload arbitrary files without logging in

**Fix:** Make all buckets private. Add RLS policies requiring `auth.uid() IS NOT NULL AND is_user_approved(auth.uid())` for SELECT, and role-scoped policies for INSERT/UPDATE/DELETE.

---

**2. `user_notifications` INSERT Is Open to Unauthenticated Users**
The INSERT policy has `WITH CHECK (true)` on the `public` role. Anyone can inject fake notifications targeting any user_id without authentication.

**Fix:** Restrict INSERT to `service_role` only (triggers already handle inserts).

---

**3. `sms_notification_logs` INSERT Is Open to Unauthenticated Users**
Same issue — `WITH CHECK (true)` on `public` role. Attackers can flood the SMS log table with fake entries.

**Fix:** Restrict INSERT to `service_role` only.

---

**4. `user_achievement_progress` Has Unrestricted ALL Policy on Public Role**
The "Service role can manage progress" policy uses `USING (true)` on the `public` role. Any unauthenticated user can read all users' progress and manipulate achievement data.

**Fix:** Change the policy role from `public` to `service_role`, or add proper `auth.uid()` scoping.

---

**5. `admin_notifications` INSERT Open to All Authenticated Users**
Any authenticated user (even a basic auditor) can inject items into the admin notification feed.

**Fix:** Restrict INSERT to admin/super_admin roles or service_role only.

---

**6. `audits` Table — Any Approved User Can DELETE**
The RLS policy `is_user_approved(auth.uid())` on DELETE means any approved field manager or auditor can delete any audit. This should be restricted to admin/super_admin.

**Fix:** Add role check: `has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')`.

---

**7. `interview_metadata` — PII Accessible to All Approved Users**
Contains interviewee name, phone, age, birth year, tribe, clan, location. All 4 DML operations are open to any approved user regardless of role. An auditor can modify or delete metadata for interviews outside their scope.

**Fix:** Scope SELECT/UPDATE/DELETE by role or contractor ownership.

---

**8. Edge Functions Have No Auth Validation in Code**
All 12 edge functions have `verify_jwt = false` and most do **not** validate the caller's identity in code. Critical functions like `clear-storage`, `cleanup-burn-queue`, and `cleanup-audit-files` can be called by anyone who knows the URL.

**Fix:** Add JWT validation and role checks inside each edge function, especially `clear-storage`, `cleanup-burn-queue`, `cleanup-audit-files`, and `send-failed-audit-sms`.

---

**9. Leaked Password Protection Disabled**
Users can sign up with passwords known to be compromised in data breaches.

**Fix:** Enable HIBP check via `configure_auth` tool with `password_hibp_enabled: true`.

---

### HIGH — Bugs That Could Cause Data Loss or Corruption

**10. BurnQueue Permanent Delete Missing Cascade Tables**
The delete mutation in `BurnQueue.tsx` cascades to 9 tables but misses several: `artifact_comment_reads`, `user_notifications` (referencing audit_id in metadata), `burn_queue` entry is deleted after `audits` (FK violation risk if `burn_queue.audit_id` references `audits.id`).

**Fix:** Delete `burn_queue` row BEFORE deleting from `audits`. Add missing cascade tables.

---

**11. Bulk Operations Are Sequential Without Error Handling**
`handleBulkRestore` and `handleBulkDelete` loop with `await mutateAsync(id)` — if one fails midway, remaining items are skipped with no rollback or retry. Partial state corruption.

**Fix:** Use `Promise.allSettled` or add try/catch per item with a summary of successes/failures.

---

**12. BurnQueue Stats Query Makes 3 Separate Round-trips**
Fetches `burn_queue` once for IDs, then batches `interview_metadata`, then re-fetches `burn_queue` again for `sent_at`. This is slow and wasteful.

**Fix:** Fetch `sent_at` in the first query. Or create an RPC that returns all stats in one call.

---

**13. `payment_records` Readable by All Approved Users**
Financial data (pay rates, invoice numbers, amounts) has no role scoping — any approved auditor can read all payment records.

**Fix:** Scope SELECT to contractor owners and admin/finance roles.

---

### MEDIUM — Operational Issues

**14. Mobile ZIP Files Can Be Deleted/Overwritten Without Auth**
Storage policies on `mobile-zips` allow DELETE and UPDATE from the `public` (unauthenticated) role.

**Fix:** Restrict to authenticated users with role checks.

---

**15. Realtime Channels Have No Authorization**
Any authenticated user can subscribe to any Realtime channel and receive other users' notifications, presence updates, and assignment changes.

**Fix:** Add RLS on Realtime topics or use private channels with token validation.

---

**16. No Rate Limiting on Auth or Edge Functions**
Sign-up, login, and all edge functions have no rate limiting. Brute-force and DDoS are possible.

**Fix:** Add rate limiting via Supabase Auth config and edge function middleware.

---

**17. Session Token Handling — No Forced Re-auth on Role Change**
When an admin changes a user's role in `AdminDashboard`, the user's existing session retains the old role until they manually refresh. They could continue performing actions with elevated privileges.

**Fix:** Invalidate sessions on role change, or re-fetch role on every protected action.

---

**18. `check-field-audit` Exposes AVTool API Key in Code**
The edge function passes `AVTOOL_API_KEY` as both `apikey` header and `Authorization` bearer token. If the function returns verbose errors, the key could leak.

**Fix:** Already using env vars (good), but ensure error responses never include headers or internal details.

---

### LOW — Code Quality & Performance

**19. `useStatusCounts` Fetches All Audits Client-Side**
Paginates through all audits in 1000-row batches to count statuses. For large datasets (10k+ audits), this is extremely slow.

**Fix:** Create an RPC `get_status_counts` that does server-side aggregation.

---

**20. Multiple Pages Duplicate the Same Query Patterns**
`InterviewTracking`, `AdminReviewHistory`, `Index`, and `BurnQueue` all independently fetch burn_queue IDs, interview_metadata, and build similar stat calculations.

**Fix:** Extract shared data-fetching into centralized hooks.

---

**21. `any` Type Usage Throughout**
`selectedFailedInterview: any`, `TrackingInterview` casts, and multiple `as any` throughout reduce type safety and make bugs harder to catch.

**Fix:** Define proper TypeScript interfaces for all data shapes.

---

### Remediation Priority

| Priority | Item | Effort |
|----------|------|--------|
| 1 (Now) | Make storage buckets private | Low |
| 2 (Now) | Fix INSERT policies on notifications/SMS/achievements | Low |
| 3 (Now) | Restrict audits DELETE to admins only | Low |
| 4 (Now) | Add auth checks to critical edge functions | Medium |
| 5 (Soon) | Enable leaked password protection | Low |
| 6 (Soon) | Scope interview_metadata and payment_records by role | Medium |
| 7 (Soon) | Fix BurnQueue cascade order and missing tables | Low |
| 8 (Soon) | Add error handling to bulk operations | Low |
| 9 (Later) | Move status counts to server-side RPC | Medium |
| 10 (Later) | Add rate limiting | Medium |
| 11 (Later) | Fix Realtime channel authorization | High |

Would you like me to proceed with fixing these issues? I recommend starting with the critical security items (1-5) first.

