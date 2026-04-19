

## Goal
1. Make the **Analyze PDF** button gracefully fall back to manual scoring whenever AI is unavailable (credit exhaustion, rate limit, network, or any error).
2. Add a **Super Admin → AI Settings** page where each AI-powered section can be toggled on/off. When OFF, the section's button is hidden/disabled and only manual entry is shown.

## AI-powered sections identified
| Key | Where it's used | Edge function | Manual fallback today? |
|---|---|---|---|
| `pdf_analysis` | Review page → "Analyze PDF" / "Re-analyze" | `analyze-pdf` | Manual sliders exist (improve trigger) |
| `audio_summary` | Review page → "Confirm Durations" auto-runs AI | `regenerate-audio-summary` | Durations save anyway (already silent fallback) |
| `fraud_analysis` | Agent Fraud Analysis page (auto-runs) | `fraud-analysis` | Indicators/charts still render — just no AI narrative |
| `error_suggestion` | Error Console → "Get AI suggestion" button | `suggest-error-fix` | Note field is manual |
| `invoice_parsing` | Payment → Upload Invoice PDF | `parse-invoice-pdf` | Manual Invoice Entry dialog already exists |

## Changes

### 1. Database (migration)
New table `ai_feature_settings` (single-row config) with one boolean column per feature:
```
pdf_analysis_enabled, audio_summary_enabled, fraud_analysis_enabled,
error_suggestion_enabled, invoice_parsing_enabled
```
RLS: SELECT for any authenticated user; UPDATE only for `super_admin`. Seed one row with all `true`.

### 2. Hook
`src/hooks/useAiSettings.ts` — React Query hook returning the settings row (cached, 5 min stale). Used by every AI trigger point.

### 3. New page — Super Admin AI Settings
`src/pages/AISettings.tsx` (route `/admin/ai-settings`, guarded by existing `AdminRoute` + role check for `super_admin`).
- One card per feature with a `Switch` (uses existing `src/components/ui/switch.tsx`) and short description of what the manual fallback looks like.
- Save updates row via `supabase.from('ai_feature_settings').update(...)`.
- Add a link in `UserMenu.tsx` (Super Admin only) and a `<Route>` in `App.tsx`.

### 4. PDF Analysis — make manual scoring always reachable
- `PDFAnalysisPanel.tsx`: when `pdf_analysis_enabled === false`, hide the "Analyze PDF" / "Re-analyze" buttons and **auto-open the edit-scores form** so the auditor can enter clarity + legibility manually and save.
- `ReviewInterview.tsx` `handleAnalyzePDF`: any non-success outcome (current `ai_unavailable`, plus `error`/`data?.error`/network throw) sets `aiUnavailable = true` so manual scoring opens automatically — closing the gap when the function throws before reaching the graceful path.
- Existing "Edit Scores" flow already persists to `interview_metadata` with `pdf_scores_manually_adjusted = true` — no changes needed there.

### 5. Audio Summary
- `AudioPlayerPanel.tsx`: skip the `regenerate-audio-summary` invoke when `audio_summary_enabled === false`. Durations + noise levels still save (they already do).
- Add a small "Manual quality notes" textarea on the panel that is only shown when AI is off, saved into `interview_metadata.audio_quality_summary`.

### 6. Fraud AI narrative
- `AgentFraudAnalysis.tsx`: when `fraud_analysis_enabled === false`, skip the `useQuery` (set `enabled: false`) and hide `ActionPlanCard`. Indicators still render. Add a small inline note "AI narrative disabled by admin."

### 7. Error suggestion
- `ErrorConsole.tsx`: hide the "Get AI suggestion" button when `error_suggestion_enabled === false`. The existing "Add note" flow remains as the manual path.

### 8. Invoice parsing
- `InvoiceUploadDialog.tsx`: when `invoice_parsing_enabled === false`, hide the upload-PDF tab/button and surface only the existing `ManualInvoiceEntryDialog` path (link/button "Enter invoice manually").

## Files

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | Create `ai_feature_settings` table + RLS + seed |
| `src/hooks/useAiSettings.ts` | New hook |
| `src/pages/AISettings.tsx` | New super admin page |
| `src/App.tsx` | Add `/admin/ai-settings` route |
| `src/components/UserMenu.tsx` | Add "AI Settings" link for super_admin |
| `src/components/review/PDFAnalysisPanel.tsx` | Respect toggle; auto-edit mode when off |
| `src/pages/ReviewInterview.tsx` | Treat all analyze-pdf failures as `aiUnavailable` |
| `src/components/review/AudioPlayerPanel.tsx` | Skip AI summary when off; manual notes textarea |
| `src/pages/AgentFraudAnalysis.tsx` | Disable AI query when off |
| `src/pages/ErrorConsole.tsx` | Hide AI suggestion button when off |
| `src/components/payment/InvoiceUploadDialog.tsx` | Hide PDF parsing when off |

## Out of scope
- Per-user toggles (this is global super-admin only).
- Edge function code changes — toggles are enforced client-side; functions remain untouched.
- Removing existing graceful 402/429 handling in edge functions (still useful as a backstop).

