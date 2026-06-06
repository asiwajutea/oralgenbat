# Performance & UX Optimization Plan

A prioritized plan to improve load speed, runtime responsiveness, and user
experience for the Backend Audit Tool. Each item lists **what**, **why it
matters**, and **effort/impact**.

---

## Findings summary (evidence from the codebase)

| Area | Observation |
|------|-------------|
| Routing | All **43 pages** are statically imported in `App.tsx`. No `React.lazy`, `Suspense`, or dynamic `import()` anywhere in `src/`. |
| Heavy libs | `recharts` is imported in **18+ components**, `jspdf` in 6 pages/utils, `jszip` in 4 files, `react-pdf`/`pdfjs-dist` for the viewer. All bundled into the **single main chunk**. |
| Build config | `vite.config.ts` has **no `build.rollupOptions.manualChunks`** — vendor code is not separated, so any code change busts the whole cache. |
| PDF.js worker | Loaded at runtime from `//unpkg.com/...` (external CDN) in `PDFViewer.tsx`. Adds a third-party network dependency on the critical path. |
| PDF rendering | `PDFViewer` renders **all pages at once** with `renderTextLayer` + `renderAnnotationLayer` enabled and no virtualization. |
| Data fetching | 120 files query Supabase; large list pages (`TeamApprovals`, `AdminReviewHistory`, `BurnQueue`, `InterviewTracking`) are 1,000–1,450 lines and do many sequential `.select()` calls. |
| Realtime | ~17 files open realtime `.channel()` subscriptions or `setInterval` timers, several mounted globally. |

---

## Phase 1 — Quick wins (highest impact / lowest risk)

### 1.1 Route-based code splitting with `React.lazy` + `Suspense`
**What:** Convert the static page imports in `App.tsx` to `React.lazy(() => import(...))`
and wrap `<Routes>` in a `<Suspense fallback={...}>`.
**Why it matters:** Today the browser must download, parse, and execute **every
page** (admin dashboards, analytics, PDF tooling, etc.) before the first screen
renders — even for a user who only visits the home page. Splitting per route
means each user downloads only the code for the page they open. This is the
single biggest reduction to initial bundle size and Time-to-Interactive.
**Effort:** Medium · **Impact:** Very High

### 1.2 Manual vendor chunking in Vite
**What:** Add `build.rollupOptions.output.manualChunks` to split big libraries
(`react`/`react-dom`/`react-router`, `recharts`, `pdfjs-dist`/`react-pdf`,
`jspdf`, `jszip`, `@radix-ui/*`, `@supabase/supabase-js`) into separate chunks.
**Why it matters:** Vendor libraries change rarely. Isolating them lets the
browser cache them long-term, so shipping an app code change doesn't force users
to re-download megabytes of unchanged library code. Also parallelizes downloads.
**Effort:** Low · **Impact:** High

### 1.3 Self-host the PDF.js worker (remove unpkg CDN dependency)
**What:** In `PDFViewer.tsx`, replace the `//unpkg.com/...` worker URL with a
bundled worker via `import` (e.g. `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`).
**Why it matters:** The current setup blocks PDF rendering on a third-party CDN
that can be slow, rate-limited, or blocked on corporate networks — and the
version is string-interpolated, which silently breaks if it drifts. Self-hosting
makes the viewer reliable, faster, and offline/PWA-friendly.
**Effort:** Low · **Impact:** Medium-High (critical for the review workflow)

### 1.4 Lazy-load chart and PDF/zip code at the component level
**What:** Dynamically import `recharts`, `jspdf`, and `jszip` only when needed
(e.g. lazy chart components, and `await import('jspdf')` inside export handlers).
**Why it matters:** `recharts` and `jspdf` are among the largest dependencies.
Most users never trigger a PDF export or open an analytics chart, yet they pay
the download cost on every visit. Deferring them shrinks every page's baseline.
**Effort:** Medium · **Impact:** High

---

## Phase 2 — Rendering & runtime responsiveness

### 2.1 Virtualize / lazy-render PDF pages
**What:** Render PDF pages on demand (only pages near the viewport) and consider
disabling `renderTextLayer`/`renderAnnotationLayer` unless text selection is
required.
**Why it matters:** A multi-hundred-page audit PDF currently mounts every page
plus two extra DOM layers each at once, which freezes the tab and spikes memory.
Windowing keeps scrolling smooth regardless of document size.
**Effort:** Medium · **Impact:** High (on the core review screen)

### 2.2 Paginate / virtualize large data tables
**What:** Ensure heavy list pages (`AdminReviewHistory`, `TeamApprovals`,
`BurnQueue`, `InterviewTracking`, `AuditTable`) use server-side pagination
(`.range()`) and/or row virtualization, and request only needed columns.
**Why it matters:** These pages are the largest in the app and fetch big result
sets. Rendering thousands of rows in the DOM is slow to paint and janky to
scroll; fetching all columns wastes bandwidth. Pagination bounds the cost.
**Effort:** Medium-High · **Impact:** High

### 2.3 Parallelize sequential Supabase queries
**What:** Where a page runs multiple independent `.select()` calls in sequence,
batch them with `Promise.all` (or combine via joins/views).
**Why it matters:** Sequential awaits add network round-trips that stack up,
delaying the first meaningful render. Parallel fetches cut perceived load time.
**Effort:** Medium · **Impact:** Medium

### 2.4 Memoize expensive components and derived data
**What:** Apply `React.memo`, `useMemo`, and stable `useCallback` to large table
rows, chart data transforms, and filter computations.
**Why it matters:** Only ~35 files currently use memoization. Large lists
re-compute and re-render on every parent state change (typing in a filter, a
realtime tick), causing visible lag.
**Effort:** Medium · **Impact:** Medium

---

## Phase 3 — Network, realtime & app shell

### 3.1 Audit global realtime subscriptions & intervals
**What:** Review the ~17 `.channel()`/`setInterval` usages; ensure each
unsubscribes on unmount, scope them to where they're needed, and debounce
high-frequency updates.
**Why it matters:** Globally-mounted subscriptions and timers keep running on
every page, consuming a websocket/CPU budget and triggering re-renders even when
their data isn't visible. Leaked channels compound over a long session.
**Effort:** Medium · **Impact:** Medium

### 3.2 Reduce provider/context churn
**What:** Verify the deep provider stack in `App.tsx` (Auth, Presence,
FloatingChat, Announcement, Theme, Tooltip) splits state so a change in one
context doesn't re-render the whole tree; move rarely-changing values out of hot
contexts.
**Why it matters:** A single top-level context update can cascade re-renders
across the entire app, which users feel as input lag.
**Effort:** Medium · **Impact:** Medium

### 3.3 Tune React Query defaults per query
**What:** `staleTime: Infinity` is set globally. Keep it for static lookups but
set sensible `staleTime` for data that changes (queues, approvals, inbox).
**Why it matters:** `Infinity` means users can see stale counts/lists until a
manual refresh — a correctness/UX risk. Per-query tuning balances freshness vs.
network chatter.
**Effort:** Low · **Impact:** Medium (UX correctness)

### 3.4 Add bundle visibility & budgets
**What:** Add `rollup-plugin-visualizer` (or `vite build --report`) and track
chunk sizes; optionally set CI size budgets.
**Why it matters:** Makes regressions visible so the bundle doesn't silently
re-bloat after these fixes land.
**Effort:** Low · **Impact:** Medium (prevents regressions)

---

## Suggested execution order

1. **Phase 1.1 + 1.2** together — route splitting + manual chunks (biggest, safest win).
2. **Phase 1.3** — self-host PDF worker (reliability of core workflow).
3. **Phase 1.4** — defer recharts/jspdf/jszip.
4. **Phase 2.1 / 2.2** — PDF and table rendering on the heaviest screens.
5. **Phase 2.3 / 2.4 / Phase 3** — incremental refinement.

Recommend measuring before/after with a production build report (3.4) so each
phase's impact is quantified.
