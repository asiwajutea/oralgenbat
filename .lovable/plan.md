# Plan

## 1. Team Assignments — Export History fixes

**File:** `supabase/functions/export-team-pdfs/index.ts` (re-download branch around lines 47–87).

- Expand the audits SELECT to include `mobile_zip_url, is_re_audit, passed_with_failures`.
- Look up matching `re_audit_submissions` (replaced_zip=true) for re-audited audits.
- Build `pdfList` the same way as the fresh-export branch:
  - `baseName = passed_with_failures ? "${file_name}_attention" : file_name`
  - Include `metadataUrl` / `metadataFileName` for re-audited audits with replaced zips.
- Also regenerate / re-attach the override-notes PDF if any overridden audits exist in the batch (reuse the existing block, factored into a helper).

**File:** `src/pages/TeamAssignments.tsx` `handleExportTeamPDFs` (lines 318–386).

- Add a download progress UI for new batch downloads:
  - State: `exportProgress = { current, total, fileName }` per team.
  - Wrap the for-loop fetch in fetch-with-progress (use `Response.body` reader to count bytes; for simplicity, increment `current` per file completed and show `current/total` plus the filename).
  - Replace the static `toast.info("Downloading N PDFs…")` with a sticky `toast.loading(...)` updated via `toast.message(id, …)` OR render a small inline progress bar next to the team row (preferred: a `Progress` bar component under the team card while `exportingTeamId === team.id`).
- Reset progress in `finally`.

## 2. Penalty pages — bulk actions

Affected files: `src/pages/PenaltyAdmin.tsx`, `src/pages/MyPenalties.tsx`.

Selected actions: **Mark Paid**, **Waive/Void**, **Mark Appealed**.

- Add row checkboxes + header "select all" checkbox to the Charges table on both pages.
- Selection state: `Set<string>` of charge ids.
- Render a sticky bulk-action toolbar above the table when selection > 0:
  - Admin (`PenaltyAdmin`): "Mark Paid" + "Waive / Void" buttons.
  - Non-admin (`MyPenalties`): "Mark Appealed" button.
- Confirmation dialogs (`AlertDialog`) before each bulk action.
- Implementations:
  - **Mark Paid** (admin): for each selected charge, call existing single-charge payment confirmation flow in a loop (or insert one `penalty_payments` row per charge with `status='confirmed', amount=charge.amount - paid_amount`, then update `penalty_charges.status='paid'`). Reuse current single-action code path.
  - **Waive/Void** (admin): bulk update `penalty_charges` set `status='voided', removed_by=auth.uid(), removed_at=now()` for selected ids.
  - **Mark Appealed** (non-admin): bulk update own `penalty_charges` set `appeal_status='pending', appeal_reason=<reason from prompt textarea>` (single textarea applied to all).
- Refresh data + toast summarizing count succeeded / failed.

No new tables, no DB migration. Uses existing columns (`status`, `appeal_status`, `appeal_reason`, `removed_at`, `removed_by`, `penalty_payments`).

## 3. Inbox redesign — Gmail-style (mobile-first, 2-pane desktop)

**Files:**
- `src/pages/Inbox.tsx` — full rewrite of layout, keep all data hooks and handlers intact.
- `src/components/InboxBell.tsx` — change unread cap.
- `src/components/NotificationBell.tsx` — change unread cap to match.

### Layout

```text
Desktop (md+):  [ Sidebar (categories) | Main pane                              ]
                |                       | header (search + new + actions)        |
                |                       | thread list OR open thread (toggle)    |
                |                       |                                        |

Mobile (<md):   Stack. Default = thread list (full width). Tap thread → full
                thread view with back button. Categories accessible via
                Sheet drawer triggered by a hamburger button in the header.
```

Two-pane on desktop: clicking a conversation hides the list and shows the open thread full-width in the right pane. A back button (or "Inbox" breadcrumb) returns to the list. This matches Gmail behavior more closely than the current 3-pane.

### Visual style

- Gmail-like list rows: avatar circle (initials), bold sender/title, single-line preview muted, right-aligned relative timestamp; unread rows have stronger weight + subtle left border in `--primary` and a faint background.
- Sticky search bar at top of list; "New chat" + category filter chip row beneath.
- Use existing design tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `--primary`); no hardcoded colors.
- Replace `<select>` mobile category control with `Sheet` + button list mirroring desktop sidebar; categories show unread badge.

### Functionality preserved

All existing handlers stay: `handleSend`, `handleRename`, `handleDeleteConversation`, `handleLeaveConversation`, `handleDeleteMessage`, attachments, interview ref, internal link, mark-read effect, realtime channel, closed-conversations section, category unread totals.

### Mobile-friendly composer

- Composer becomes a sticky bottom bar in the open-thread view with attachment menu collapsed into an icon button (already an `AttachmentMenu`).
- Use `h-[100dvh]` instead of `h-[calc(100vh-…)]` so iOS Safari address bar doesn't clip.

### Unread badge

- `InboxBell.tsx`: `{unread > 99 ? "99+" : unread}` (currently `> 9 ? "9+"`).
- `NotificationBell.tsx`: same change in both places (lines 143 and 151).

## Out of scope

- No DB migrations, no edge-function deploys other than `export-team-pdfs`.
- No change to chat schema, RPCs, or notification preferences UI.
- No redesign of `MiniChatWindow` / `FloatingChatProvider`.

## Files touched

- `supabase/functions/export-team-pdfs/index.ts`
- `src/pages/TeamAssignments.tsx`
- `src/pages/PenaltyAdmin.tsx`
- `src/pages/MyPenalties.tsx`
- `src/pages/Inbox.tsx`
- `src/components/InboxBell.tsx`
- `src/components/NotificationBell.tsx`
