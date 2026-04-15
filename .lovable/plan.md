

## Plan: Error Debug Console for Super Admins

A new `/admin/error-console` page accessible only to `super_admin` that captures client-side errors in real-time, stores them in a database table, and displays them with AI-generated fix suggestions.

---

### 1. Database: `client_error_logs` Table

New migration to create a table for storing error events:

```sql
CREATE TABLE public.client_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  user_role text,
  error_message text NOT NULL,
  error_stack text,
  error_source text,          -- 'runtime' | 'unhandled_rejection' | 'network' | 'react_boundary'
  page_url text,
  component_name text,
  browser_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  notes text,
  suggested_fix text
);

ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read/manage
CREATE POLICY "Super admins can manage error logs"
  ON public.client_error_logs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Any authenticated user can insert (to report errors)
CREATE POLICY "Authenticated users can insert error logs"
  ON public.client_error_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_error_logs;
```

### 2. Global Error Capture: `src/components/ErrorBoundary.tsx` + `src/hooks/useGlobalErrorCapture.ts`

**ErrorBoundary** — React error boundary that catches render crashes, logs to DB, and shows a fallback UI. Wrap the app in this.

**useGlobalErrorCapture** — Hook placed in Layout that listens to:
- `window.onerror` — uncaught runtime errors
- `window.onunhandledrejection` — unhandled promise rejections
- Intercepts `console.error` to capture React warnings

Each captured error is debounced (same message within 5s = skip) and inserted into `client_error_logs` with user context from AuthContext.

### 3. AI Fix Suggestions: Edge Function `suggest-error-fix`

A backend function that receives an error message + stack trace, calls the AI gateway to generate a suggested fix, and returns it. Called on-demand from the console page when super_admin clicks "Get Fix Suggestion" on an error.

### 4. Dashboard Page: `src/pages/ErrorConsole.tsx`

**Stats Cards (top):**
- Total Errors (24h)
- Unresolved Errors
- Most Affected Page
- Most Common Error

**Real-time Error Feed:**
- Live-updating table via Supabase Realtime subscription
- Columns: Time, User, Role, Error Message (truncated), Source, Page, Status
- Click to expand full stack trace + suggested fix
- "Mark Resolved" and "Add Note" actions
- Bulk "Mark All Resolved" button

**Filters:**
- Date range picker
- Error source filter (runtime, network, react_boundary, unhandled_rejection)
- Resolved/Unresolved toggle
- Search by error message

**Error Detail Panel (expandable row or dialog):**
- Full error message and stack trace
- User info (email, role)
- Browser info
- Page URL
- AI-suggested fix (fetched on demand)
- Notes field
- Resolution controls

**Charts:**
- Errors over time (bar chart, last 7 days)
- Errors by source (pie/donut)
- Top 5 most frequent errors

### 5. Navigation & Routing

- Route: `/admin/error-console` guarded by a super_admin-only check (inline in the route component)
- Add link in Admin dropdown in `Header.tsx` (only for super_admin)
- Add link in `MobileNav.tsx` admin section (only for super_admin)

### 6. App Integration

- Wrap `<App>` children with `<ErrorBoundary>` in `App.tsx`
- Add `useGlobalErrorCapture()` call inside `Layout.tsx`

---

### Technical Summary

| Area | Files | Change |
|------|-------|--------|
| DB table | New migration | `client_error_logs` with RLS + realtime |
| Error capture | `ErrorBoundary.tsx`, `useGlobalErrorCapture.ts` | Global error interception |
| Edge function | `suggest-error-fix/index.ts` | AI-powered fix suggestions |
| Dashboard | `ErrorConsole.tsx` | Stats, real-time feed, charts, filters |
| Navigation | `App.tsx`, `Header.tsx`, `MobileNav.tsx` | Route + nav links for super_admin |
| Integration | `App.tsx`, `Layout.tsx` | Error boundary + hook wiring |

