

## Plan: FM Dashboard Mobile Fix, Fraud Analysis Enhancements, and Duplicate Detection Page

This plan addresses 3 areas: mobile optimization for the Field Manager Dashboard, enhancements to the Agent Fraud Analysis report page, and a new Duplicate Interviews detection page under Admin.

---

### 1. Field Manager Dashboard Mobile Optimization

**File: `src/pages/FieldManagerDashboard.tsx`**

The dashboard container uses `flex min-h-screen w-full` but the inner content doesn't constrain width on mobile properly. The `container` class and padding cause overflow.

**Changes:**
- Replace `container mx-auto p-4 md:p-6` with `w-full px-3 md:px-6 py-4 md:py-6 max-w-full overflow-hidden` to ensure content fits mobile width
- Ensure the mobile stat scroll area uses `-mx-3 px-3` instead of `-mx-2 px-2` to align with new padding
- Add `overflow-x-hidden` to the main wrapper
- Ensure accordion items use `overflow-hidden` and text truncation works correctly
- Fix the overall flex layout so the sidebar doesn't cause horizontal overflow on tablets

---

### 2. Fraud Analysis Report: Time Period Filter

**File: `src/hooks/useFraudAnalytics.ts`**

Currently `useFraudAnalytics` is hardcoded to 13 weeks. Add a `period` parameter.

**Changes:**
- Update `useFraudAnalytics(interviewerCode, period)` to accept an optional `TimePeriod` parameter (default: `'13weeks'`)
- Compute the date cutoff based on period: 13 weeks, 365 days, or no cutoff for lifetime
- Update the query key to include `period`

**File: `src/pages/AgentFraudAnalysis.tsx`**

**Changes:**
- Add `useState<TimePeriod>('13weeks')` for the period selector
- Add a `Select` dropdown (13 Weeks / 365 Days / Lifetime) in the header next to the Download button
- Pass `period` to `useFraudAnalytics(interviewerCode, period)` and to the AI analysis query key
- Update the header text from hardcoded "(13 weeks)" to reflect the selected period

---

### 3. Duplicate Interview Deduplication in Fraud Analysis

**File: `src/hooks/useFraudAnalytics.ts`**

**Changes:**
- After transforming metadata to `InterviewData[]`, deduplicate by `file_name`: if multiple interviews share the same `file_name`, keep only the first occurrence (by earliest timestamp)
- This prevents duplicate folder names from skewing fraud calculations

---

### 4. "View Affected Interviews" Modals for Fraud Indicators

**New file: `src/components/fraud/AffectedInterviewsModal.tsx`**

Create a reusable modal that displays a list of affected interviews with charts. Props:
- `open`, `onOpenChange`
- `title` (e.g., "Short Family Stories", "Page Boundary Hits")
- `interviews` (array of interview data with relevant fields)
- `chartType` ('duration' | 'names' | 'boundary') to render the appropriate visualization

The modal will contain:
- A summary section with count of affected interviews
- A chart (bar chart showing durations, scatter plot for names, etc.)
- A table listing each affected interview with: Interview ID, Date, relevant metric value, status

**Files to update:**
- `src/components/fraud/AudioDurationChart.tsx`: Add "View All" button that opens modal with short family stories / short pedigrees data, showing a bar chart of each interview's duration vs threshold
- `src/components/fraud/NamesPatternChart.tsx`: Add "View All" button showing interviews grouped by suspicious name counts, with a scatter plot of names per interview over time
- `src/components/fraud/PageBoundaryChart.tsx`: Add "View All" button showing interviews that hit exact boundaries, with a timeline visualization

---

### 5. Interview Intervals: Show Total Names

**File: `src/components/fraud/IntervalTimeline.tsx`**

**Changes:**
- Update the `closeIntervals` interface to include `totalNames1` and `totalNames2` (optional numbers)
- In the interval table, display total names in brackets after each interview ID: `NG71_650_20250405_1234 (24 names)`

**File: `src/hooks/useFraudAnalytics.ts`**

**Changes:**
- When building `closeIntervals`, include `totalNames1` and `totalNames2` from the sorted interviews array

**File: `src/hooks/useFraudAnalytics.ts` (FraudIndicators interface)**
- Add `totalNames1?: number | null` and `totalNames2?: number | null` to the closeIntervals type

---

### 6. Additional Visual Analysis Cards

**File: `src/pages/AgentFraudAnalysis.tsx`**

Add two new analysis sections below the existing fraud indicators grid:

**a) Pass/Fail Distribution Pie Chart**
- Show a pie chart of the agent's audit outcomes (Passed, Failed, Awaiting, Pending)
- Include comparison text vs. expected pass rate

**b) Interview Volume Timeline**
- A line/area chart showing number of interviews per week over the selected time period
- Highlights weeks with unusually high volume

These will use existing `fraudProfile.interviews` data and recharts components.

---

### 7. Duplicate Interviews Detection Page

**New file: `src/pages/DuplicateInterviews.tsx`**

A new admin page that:
1. Queries all `audits` and groups by `file_name`
2. Filters to show only `file_name` values that appear more than once
3. For each duplicate group, displays a card/table showing:
   - File name (interview ID)
   - Each duplicate row with: audit ID, status, uploaded_at, reviewed_at, reviewed_by, has metadata (yes/no), has ZIP (yes/no)
   - A radio button or checkbox to select which one to keep
4. "Delete Selected Duplicates" button that:
   - Deletes the selected audit rows
   - Also cleans up related `interview_metadata`, `interview_photos`, `re_audit_submissions` rows
   - Shows confirmation dialog before deletion

**File: `src/App.tsx`**
- Add route `/admin/duplicates` wrapped in `FullAdminRoute`

**File: `src/components/Header.tsx`**
- Add "Duplicate Detection" link to the Admin dropdown menu

---

### Technical Summary

| File | Change |
|------|--------|
| `src/pages/FieldManagerDashboard.tsx` | Fix mobile width overflow with proper padding and max-width constraints |
| `src/hooks/useFraudAnalytics.ts` | Add period parameter, deduplicate by file_name, include totalNames in closeIntervals |
| `src/pages/AgentFraudAnalysis.tsx` | Add time period selector, pass/fail pie chart, interview volume timeline |
| `src/components/fraud/AffectedInterviewsModal.tsx` | New modal component for viewing affected interviews with charts |
| `src/components/fraud/AudioDurationChart.tsx` | Add "View All" button opening affected interviews modal |
| `src/components/fraud/NamesPatternChart.tsx` | Add "View All" button opening affected interviews modal |
| `src/components/fraud/PageBoundaryChart.tsx` | Add "View All" button opening affected interviews modal |
| `src/components/fraud/IntervalTimeline.tsx` | Show total names in brackets after interview IDs |
| `src/pages/DuplicateInterviews.tsx` | New admin page for detecting and managing duplicate interviews |
| `src/App.tsx` | Add `/admin/duplicates` route |
| `src/components/Header.tsx` | Add "Duplicates" to Admin dropdown |

