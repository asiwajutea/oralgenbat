## Overview

Five workstreams: (1) put Activity History in mobile nav, (2) scope "Reassign FM" to FMs in the same contractor, (3) auto-create historical FM overrides when an agent moves teams so old interviews stay with the previous FM, (4) build a full chat/inbox system, (5) wire chat into existing flows (audit fail, tracking comments, push/notice).

---

## 1. Activity History in nav (all devices)

- Add an "Activity History" entry under a new bottom section in `MobileNav.tsx` (icon: `Activity`, route `/activity`) — currently only present in `UserMenu` dropdown.
- Add an "Activity History" link in the desktop `Header.tsx` (under Communications dropdown or as standalone item next to "My Reviews").

## 2. FM Reassignment scoped to same contractor

- Replace `get_canonical_field_managers()` with `get_assignable_field_managers(_for_contractor text DEFAULT NULL)` SECURITY DEFINER RPC that:
  - For `field_manager` / `contractor` / `sub_contractor`: returns approved FMs whose `profiles.contractor_id` (or `user_contractor_assignments`) matches the caller's active contractor.
  - For `admin` / `super_admin`: returns all approved FMs (or filtered by `_for_contractor` if provided).
- Update `ReassignFMDialog.tsx` to call the new RPC and pass the audit's contractor id so the dropdown only lists FMs eligible for that contractor.

## 3. Time-sliced FM ownership when an agent is reassigned

Goal: the new FM only sees interviews uploaded **after** the reassignment date; older interviews stay with the previous FM.

- Add `team_assignment_history` table: `interviewer_code, contractor_id, field_manager_id, effective_from timestamptz, effective_to timestamptz NULL, created_by`.
- Trigger on `team_assignments`: when an `(interviewer_code, contractor_id)` row's `field_manager_id` changes (or status flips approved → unapproved), close out the prior history row (`effective_to = now()`) and insert a new active row.
- Backfill one open history row per existing approved `team_assignments` row (`effective_from = approved_at` or `created_at`).
- New RPC `backfill_fm_overrides_on_reassignment(_interviewer_code, _new_fm_id, _cutoff timestamptz)`: for every audit by that interviewer with `uploaded_at < _cutoff` that does NOT already have a row in `interview_fm_overrides`, insert one pointing to the **previous** FM. Trigger this RPC from the trigger above so the old FM keeps ownership of historical interviews while new uploads naturally route to the new FM via the current `team_assignments` row.
- Update tracking & FM dashboard FM-resolution logic so per-interview overrides always win (already does), and ensure FM dashboard queries respect overrides for older interviews.

## 4. Chat / Inbox feature

### Data model (new tables, all RLS-protected)

- `chat_conversations`: `id, type ('direct'|'group'|'audit_thread'|'system'), title, category ('general'|'failed_audit'|'tracking_comment'|'announcement'|'push'), contractor_id (nullable), audit_id (nullable, for audit threads), created_by, created_at, last_message_at, is_archived`.
- `chat_participants`: `conversation_id, user_id, role ('owner'|'member'|'observer'), joined_at, muted, last_read_at, unread_count`.
- `chat_messages`: `id, conversation_id, sender_id (nullable for system), body text, attachments jsonb, reply_to_message_id, message_type ('text'|'system'|'audit_action'|'attachment'), metadata jsonb, created_at, edited_at, deleted_at`.
- `chat_message_reads`: `message_id, user_id, read_at`.
- `chat_messaging_policies`: super-admin-managed matrix of `from_role app_role → to_role app_role → allowed bool`. Default seed: same-contractor any role ↔ any role; `super_admin` can message anyone; cross-contractor blocked except super_admin.
- `chat_user_preferences`: `user_id, categories_enabled jsonb (per category opt-in), email_digest, push_enabled`.

### RLS / security

- `chat_conversations` SELECT: caller is in `chat_participants` OR is `super_admin`.
- `chat_messages` SELECT/INSERT: caller is participant; INSERT additionally checks `can_message(sender, conversation)` security-definer function that enforces:
  - same-contractor rule (caller and all participants share contractor, or caller is super_admin),
  - `chat_messaging_policies` matrix.
- `chat_participants` only modifiable by conversation owner, admin, or super_admin.
- Super-admin manages `chat_messaging_policies` (UI in `/admin/chat-policies`).

### Edge functions

- `chat-send-message`: validates policy, inserts message, fans out push notifications via existing `send-web-push`, updates `last_message_at` and `unread_count` for other participants.
- `chat-create-audit-thread`: called when an audit is failed; creates `audit_thread` conversation with FM (full context), auditor, contractor, sub-contractor, admin participants; posts a structured system message with the failure comment, action plan, artifact correction list, and inline action buttons (metadata: `{actions: ['view_review','resolve_correction','resubmit_with_correction','resubmit_no_correction']}`).
- `chat-mirror-event`: called by triggers/webhooks to mirror push notifications, notice-board posts, and tracking-page comments into the relevant conversation.

### Database triggers

- After `audits.status` becomes `Failed Audit` → call `chat-create-audit-thread` (via `pg_net` or by inserting into a `chat_pending_events` outbox).
- After insert on `artifact_correction_comments` → mirror into the audit's chat conversation.
- After insert on `announcements` and `push_notifications` → create/append a `category='announcement'|'push'` conversation per recipient.

### Frontend

- New top-level route `/inbox` (`src/pages/Inbox.tsx`) — three-pane modern chat: category sidebar (All, Failed Audits, Tracking, Announcements, Direct, Groups), conversation list with search + unread badges, message thread with infinite scroll, composer with attachments, replies, recipient picker (multi-select supports bulk), audit-action buttons rendered inline.
- New components under `src/components/chat/`: `ConversationList`, `ConversationItem`, `MessageThread`, `MessageBubble`, `MessageComposer`, `AuditActionMessage` (renders "View Interview", "Mark Resolved", "Resubmit with Correction", "Resubmit without Correction" buttons that reuse existing dialogs/RPCs from tracking/review), `NewChatDialog` (with role-aware recipient picker honouring messaging policies), `ChatCategoryFilter`, `ChatPreferencesDialog`, `BulkRecipientPicker`.
- Realtime via Supabase Realtime channels on `chat_messages` and `chat_participants` keyed by user id.
- New hook `useChatUnreadCount` aggregating unread across conversations, optionally per-category.
- Add `InboxBell` next to `NotificationBell` in `Header.tsx` and as a top item in `MobileNav.tsx` — icon (`MessageSquare`) with red unread count badge, opens `/inbox`.

### Inbox UX details

- Category chips show per-category unread counts.
- Audit-failure thread shows a sticky header card with: file name, status badge, contractor/agent, link to review page, list of artifact corrections.
- FM sees full action toolbar; auditor/contractor/sub/admin see condensed read-only summary plus reply box.
- When FM clicks "Mark Resolved" / "Resubmit", a system message is posted automatically and the auditor receives a push + inbox notification with a "Open Review" deep link.
- Tracking page comment box gains a "Also start a chat" toggle (default on for failed interviews); existing comment threads on resolved/failed interviews automatically appear as messages in the audit thread.
- Push notifications and Notice Board posts appear under their categories with a "Open original" link.
- Composer supports bulk recipient selection (chip list) constrained by policy matrix; cross-contractor adds disabled with tooltip "Only super admin can message across contractors".

### User preferences

- `/profile` adds an "Inbox Preferences" section: per-category toggle (Failed Audits, Announcements, Push, Tracking Comments, Direct), push opt-in, email digest opt-in. Persisted in `chat_user_preferences`.

### Admin controls

- New `/admin/chat-policies` (super_admin only): editable role × role permission matrix backed by `chat_messaging_policies`, plus toggles for "auto-create audit-failure threads", "mirror push", "mirror notices", "mirror tracking comments".
- `/admin/chat-policies` also exposes a "Conversation moderation" tab to archive or delete misuse cases.

---

## Technical details

```text
audit failed
   │
   ▼
trigger writes outbox row ─► edge fn `chat-create-audit-thread`
                                    │
                                    ▼
                       insert chat_conversations(category='failed_audit', audit_id)
                                    │
                                    ├─► add participants per role
                                    ├─► insert system message with metadata.actions
                                    └─► send-web-push fan-out
```

- Use `pg_net.http_post` from triggers to call edge functions asynchronously (already used elsewhere in the project).
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages, chat_participants, chat_conversations;`
- Unread counts maintained in `chat_participants.unread_count` updated by trigger on `chat_messages` insert; reset to 0 + `last_read_at = now()` when client marks a thread read via RPC `mark_conversation_read(_conversation_id uuid)`.
- Existing audit-failure code paths (`ReviewActions`, `MarkResolvedDialog`, `ReAuditDialog`) gain calls to a new `postAuditChatSystemMessage()` helper so any state change shows up in the thread.
- All chat operations log to `user_activity_log` (existing table) so the activity history page already covers chat actions.

---

## Out of scope / deferrals

- Voice/video calling.
- End-to-end encryption.
- Message reactions/emoji picker (can add in a follow-up).

After approval I'll execute the migrations, edge functions, and UI in one delivery.