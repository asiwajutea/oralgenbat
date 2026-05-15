## Goal
Completely remove every trace of the previous Gmail integration (code, edge functions, DB tables, triggers, route changes) so nothing references the deleted `Zamoph.audit@gmail.com` connection. Then rebuild it cleanly once you reconnect Gmail.

---

## Phase 1 — Full teardown

### Edge functions to delete (code + deployed copies)
- `supabase/functions/send-gmail/`
- `supabase/functions/send-email-notification/`
- `supabase/functions/send-test-email/`

Also call `delete_edge_functions` for each so the old deployed versions stop running (the DB trigger still calls `send-email-notification` until that function is gone and the trigger is dropped — order matters, see Phase 1 step order below).

### Database objects to drop (one migration)
- Trigger `trg_dispatch_email_on_notification` on `user_notifications`
- Function `public.dispatch_email_on_notification()`
- Function `public.email_set_updated_at()`
- Triggers `trg_email_templates_updated_at`, `trg_user_email_prefs_updated_at`
- Tables: `public.email_notification_logs`, `public.email_templates`, `public.user_email_preferences`
- Any vault secret rows the old migration inserted for the dispatcher (service-role key reference)

### Frontend code to revert / remove
- `src/pages/NotificationCenter.tsx` → delete
- `src/App.tsx` → restore `/admin/sms-logs` route to point back at the original `SmsLogs` page (`src/pages/SmsLogs.tsx` still exists and is untouched)
- Remove the `NotificationCenter` import in `src/App.tsx`
- `src/integrations/supabase/types.ts` is auto-generated — it will regenerate after the migration drops the tables; do not hand-edit

### Order of operations (critical to avoid breakage)
1. Drop the `trg_dispatch_email_on_notification` trigger first (otherwise every `user_notifications` insert keeps trying to `pg_net` the dead edge function and will surface noisy errors)
2. Drop functions and tables in the same migration
3. Delete edge function code files and call `delete_edge_functions`
4. Revert the App route and delete `NotificationCenter.tsx`

---

## Phase 2 — What to avoid so nothing else breaks

- **Do not touch `user_notifications`**, `notifications`, `sms_logs`, `SmsLogs.tsx`, push notifications, or the existing `useNotifications` hook. The old work only added on top — the in-app notification system keeps working untouched.
- **Do not edit `src/integrations/supabase/client.ts` or `types.ts`** — types regenerate automatically.
- **Do not remove the `pg_net` extension** — other features may rely on it.
- **Do not delete the connector itself from Connectors UI a second time** — you already removed it. We just need a clean reconnect after teardown.
- **Header / MobileNav** were never changed in the final version (the route alias was kept), so no nav cleanup is needed. I will double-check during build.
- **Vault / secrets**: do not delete `LOVABLE_API_KEY`. The only cleanup is any `gmail_dispatcher_*` secret rows the old migration inserted (if any). Will check and only drop email-specific entries.

---

## Phase 3 — Rebuild (after you reconnect Gmail as `Zamoph.audit@gmail.com`)

Once you confirm the new Gmail connection is linked:

1. **`send-gmail` edge function** — minimal, single-purpose: accepts `{to, subject, html, text, cc?, bcc?}`, builds RFC 2822 MIME, base64url-encodes, POSTs to `connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send` with `LOVABLE_API_KEY` + `GOOGLE_MAIL_API_KEY`. Sender: `"BAT Audit" <Zamoph.audit@gmail.com>`, Reply-To same.
2. **Verify credentials first** via the gateway `verify_credentials` endpoint before wiring anything else — surface a clear error if it fails so we don't repeat the previous "Credential not found" loop.
3. **Migration** — recreate `email_templates`, `email_notification_logs`, `user_email_preferences` (+ RLS for admin/super_admin), seed default templates.
4. **`send-email-notification`** dispatcher — same contract as before (template render + log).
5. **`send-test-email`** — admin-only test endpoint.
6. **DB trigger** on `user_notifications` to dispatch emails — added LAST, only after all 3 functions are deployed and the test send succeeds.
7. **`NotificationCenter` page** with SMS Logs + Email Logs + Templates + Test Send tabs, mounted at `/admin/sms-logs`.

I'll wait for your go-ahead, then execute Phase 1 immediately. Reconnect Gmail when Phase 1 is done, and I'll proceed with Phase 3.
