## Inbox/Chat Improvements + Override Pass PDF Export

### 1. Inbox/Chat Wiring

**a. Subject at conversation start (NewChatDialog)**
- Always show a "Subject" input (not just for groups), pass into `_title` for both direct & group chats. Use friendly default if blank.

**b. Recipient name + role under each chat**
- In Inbox conversation list and thread header, fetch participants for each conversation and display: "with John Doe (Field Manager)". Add a hook `useConversationParticipants` that batch-loads participants + profiles + roles for visible conversation IDs.

**c. Add Chat Policies to nav**
- `Header.tsx`: under the Admin dropdown, add a "Chat Policies" link visible to `super_admin` only.
- `MobileNav.tsx`: add same item under admin section.

**d. Composer attachments / interview reference / link**
- Extend `Inbox.tsx` composer with an action row:
  - **Attach file** → uploads to storage bucket `chat-attachments` (new public-read-via-signed-url bucket), saves to message metadata as `attachments: [{name,url,mime,size}]`.
  - **Reference interview** → small popover with search by file_name; inserts message with metadata `interview_ref: {audit_id, file_name}` and a chip rendered in the bubble linking to `/review/:audit_id`.
  - **Insert internal link** → popover with a list of common app pages; inserts a relative path token rendered as a Link.
- Update message rendering to render attachment chips, interview-ref chip, and internal links.

**e. "Left" conversations become closed threads (reopen on new message)**
- DB migration: add `closed_at timestamptz` column to `chat_participants` (kept separate from `removed_at`).
- Change `leave_conversation` RPC to set `closed_at = now()` instead of `removed_at`.
- Inbox query: include closed conversations, group them under a collapsible "Closed" section per category, render them muted/italic.
- DB trigger on `chat_messages` INSERT: for each participant of the conversation, if `closed_at IS NOT NULL` and the new message is from someone else, clear `closed_at` (reopens).

**f. Floating draggable mini chat**
- New `FloatingChatProvider` (context) that holds an array of "minimized" conversation IDs.
- New `MiniChatWindow` component: 320×420 panel, draggable via pointer events, shows last 50 messages and composer, can be expanded back to `/inbox?conv=...` or closed.
- Add a "Minimize" button in Inbox thread header. Provider mounted in `App.tsx` so windows persist across page navigation.
- Position state stored in `localStorage` per conversation.

**g. Chat Policies role matrix UI redesign (Connecteam-style)**
Replace the dense `from x to` grid with a card-based layout:
```text
All users permissions
( • ) Users CAN start chat conversations with anyone
(   ) Users CAN'T start chat conversations with other users
        [ ] Unless they share the same   [Role/Team chip selector]
        [ ] Unless those other users are [Select users…]
        [ ] Unless those other users are their direct managers

[ ] Users can NEVER start a chat conversation with  [Selected users…]

Team chat permissions
( • ) Users CAN create new team chats   [Except…]
(   ) Users CAN'T create new team chats [Except N users]
```
- Translate UI selections into the existing `chat_messaging_policies` rows (admin/super_admin always allowed; everyone-allowed = wipe rows + insert default-true; restricted mode writes explicit role pairs and a new `chat_user_blocks` table for per-user "never message" overrides).
- Add migration: `chat_user_blocks (blocker_user_id NULL meaning system-wide, blocked_user_id, created_by)` plus `chat_global_policy (id=1, mode TEXT, allow_same_team BOOL, allow_managers_only BOOL, allow_team_chats BOOL)`.
- Update `can_start_direct_chat` RPC to consult global policy + per-user blocks before falling back to role matrix.

### 2. Override Pass interviews — Team PDF export

Edge function `export-team-pdfs/index.ts`:
- Join audits with `audit_overrides` (existing table) to know which audits were Pass-with-Override and grab the override note.
- For each PDF in `pdfList`, when override exists, suffix file_name: `${file_name}_attention.pdf`.
- Generate an additional PDF report `Override_Notes_${exportBatchId}.pdf` containing one section per overridden interview (file_name, overridden_by, overridden_at, justification/note). Use `pdf-lib` (`https://esm.sh/pdf-lib@1.17.1`). Upload to `team-exports` bucket (or generate base64 and return inline) and add it to the response `files` array as the first entry.
- If no overrides, skip the report.

Client-side: no UI change needed — client already iterates `files` and downloads them; the `_attention` suffix and the extra report file flow through naturally.

### Files to add / edit

**New**
- `src/components/chat/FloatingChatProvider.tsx`
- `src/components/chat/MiniChatWindow.tsx`
- `src/components/chat/AttachmentMenu.tsx` (attach/interview-ref/link popovers)
- `src/components/chat/MessageRenderer.tsx` (renders text + attachments + chips)
- `src/hooks/useConversationParticipants.ts`
- `src/components/chat/policies/PolicyBuilder.tsx` (new Connecteam-style UI)
- 1 SQL migration: `closed_at` column, leave/reopen logic, `chat_user_blocks`, `chat_global_policy`, updated `can_start_direct_chat`, storage bucket `chat-attachments` with RLS.

**Edit**
- `src/components/chat/NewChatDialog.tsx` — always show subject field
- `src/pages/Inbox.tsx` — participants display, closed section, attachments composer, minimize button, message renderer
- `src/pages/ChatPolicies.tsx` — replace matrix with `PolicyBuilder`
- `src/components/Header.tsx` + `src/components/MobileNav.tsx` — add Chat Policies link
- `src/App.tsx` — mount `FloatingChatProvider`
- `supabase/functions/export-team-pdfs/index.ts` — `_attention` suffix + override notes PDF
- `supabase/functions/process-chat-events/index.ts` — small tweak so reopen trigger covers system messages

### Out of scope (per your earlier note)
- GitHub sync issue.
