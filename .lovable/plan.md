

## Plan: Remove Auto-Dismiss and Add Floating Upload Progress Everywhere

### Overview
Three changes: (1) remove auto-dismiss on the existing floating panel, (2) add upload progress to the Failed Interview Modal, (3) create a reusable floating progress component and integrate it into all upload dialogs across both the Tracking and Interviews pages.

---

### 1. Remove Auto-Dismiss from Existing Floating Panel

**File: `src/pages/InterviewTracking.tsx`**
- Remove the `setTimeout(() => setActiveUpload(null), 3000)` line (around line 826)
- The panel already has a close (X) button -- users will dismiss it manually

---

### 2. Create Reusable Floating Upload Progress Component

**New file: `src/components/FloatingUploadProgress.tsx`**
- Extract the floating panel UI from `InterviewTracking.tsx` into a reusable component
- Props: `fileName`, `interviewName`, `fileSize`, `progress`, `status`, `errorMessage`, `onClose`
- Same styling: fixed bottom position, Card with colored border (green for success, red for error, primary for uploading), Progress bar, status label, manual close button
- No auto-dismiss -- always requires manual close

---

### 3. Add Progress Tracking to Failed Interview Modal

**File: `src/components/tracking/FailedInterviewModal.tsx`**
- Add `uploadProgress` state to track: `{ progress: number, status: string, currentFile: string }`
- Refactor PDF upload to use XHR with `createSignedUploadUrl` for real-time progress
- Refactor ZIP upload to use XHR with `createSignedUploadUrl` for real-time progress
- Add a progress section inside the modal showing:
  - Which file is uploading ("Uploading PDF..." / "Uploading ZIP..." / "Processing...")
  - Progress bar with percentage
  - File name and size
- Use the `FloatingUploadProgress` component to also show a sticky panel outside the modal (passed via callback to parent `InterviewTracking.tsx`)

---

### 4. Add Floating Progress to Bulk PDF Upload Dialog (Tracking Page)

**File: `src/components/tracking/BulkPdfUploadDialog.tsx`**
- Add a new `onUploadProgress` callback prop: `(progress: UploadProgressData | null) => void`
- During upload, call `onUploadProgress` with overall progress data (current file count, total, percentage)
- The dialog already has internal progress bars -- the floating panel adds visibility when the dialog is minimized on mobile

**File: `src/pages/InterviewTracking.tsx`**
- Pass `onUploadProgress` to `BulkPdfUploadDialog` that updates `activeUpload` state
- The existing floating panel renders automatically since it already watches `activeUpload`

---

### 5. Add Floating Progress to Interviews Page Upload Dialogs

**File: `src/components/UploadDialog.tsx`**
- Add `onUploadProgress` callback prop
- During `handleUpload`, call it with progress data for each file being uploaded
- Clear on completion

**File: `src/components/CombinedUploadDialog.tsx`**
- Add `onUploadProgress` callback prop
- During `processFilePair`, call it with progress data

**File: `src/pages/Index.tsx`**
- Add `activeUpload` state (same `UploadProgress` interface)
- Pass `onUploadProgress` callbacks to `UploadDialog` and `CombinedUploadDialog`
- Render the `FloatingUploadProgress` component at the bottom of the page

---

### Technical Summary

| File | Change |
|------|--------|
| `src/components/FloatingUploadProgress.tsx` | New reusable floating progress panel component |
| `src/pages/InterviewTracking.tsx` | Remove auto-dismiss; pass progress callback to BulkPdfUploadDialog and FailedInterviewModal; use FloatingUploadProgress |
| `src/components/tracking/FailedInterviewModal.tsx` | Add XHR-based upload with progress; add `onUploadProgress` callback |
| `src/components/tracking/BulkPdfUploadDialog.tsx` | Add `onUploadProgress` callback during uploads |
| `src/components/UploadDialog.tsx` | Add `onUploadProgress` callback |
| `src/components/CombinedUploadDialog.tsx` | Add `onUploadProgress` callback |
| `src/pages/Index.tsx` | Add activeUpload state, render FloatingUploadProgress |

No database changes needed.
