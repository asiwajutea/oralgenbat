

## Plan: Mobile-Friendly Upload Progress for Tracking Page

### Problem
When uploading a file from a mobile phone on the Tracking page using the per-row "Upload Metadata" button, the only feedback is a small spinner icon on the button. After selecting a file from the phone's folder, there is:
- No file name shown
- No upload progress bar
- No file size indicator
- No status updates (uploading, processing, complete)
- The user can scroll away from the row and lose sight of even the spinner

### Solution
Add a **sticky floating upload progress panel** at the bottom of the screen that appears whenever an inline upload is in progress. This panel will show the file name, size, progress bar, and current status -- visible regardless of scrolling.

### Technical Details

**File: `src/pages/InterviewTracking.tsx`**

1. **Expand upload state** (around line 159-160):
   - Change `uploadingId` from `string | null` to a richer state object:
     ```typescript
     interface UploadProgress {
       interviewId: string;
       fileName: string;
       interviewName: string;
       fileSize: number;
       progress: number; // 0-100
       status: "uploading" | "processing" | "success" | "error";
       errorMessage?: string;
     }
     const [activeUpload, setActiveUpload] = useState<UploadProgress | null>(null);
     ```

2. **Update `handleMetadataUpload`** (lines 728-794):
   - Set `activeUpload` with file details immediately after file selection
   - Use XHR with `createSignedUploadUrl` instead of direct `supabase.storage.upload` so we can track upload progress via `xhr.upload.onprogress`
   - Update progress: 0-80% for upload, 80-90% for DB update, 90-100% for edge function processing
   - Set status to "success" or "error" on completion
   - Auto-dismiss the panel after 3 seconds on success

3. **Add floating progress panel** (before the closing `</div>` of the page):
   - A sticky bottom panel (`fixed bottom-4 left-4 right-4 z-50`) that shows:
     - Interview name (e.g., "NG71_650_20250702_1233")
     - File name and size (e.g., "metadata.zip - 2.3 MB")
     - Progress bar with percentage
     - Status label ("Uploading...", "Processing metadata...", "Complete!", "Failed")
     - A dismiss/close button
   - Styled with `Card` component, with green accent on success, red on error
   - On mobile, full-width with rounded corners and shadow

4. **Keep backward compatibility**:
   - Maintain `uploadingId` derived from `activeUpload?.interviewId` so the button spinner still works
   - The per-row button still shows the spinner, but now the floating panel provides the detailed feedback

### Summary

| Area | Change |
|------|--------|
| Upload state | Replace simple `uploadingId` string with rich `UploadProgress` object |
| `handleMetadataUpload` | Use XHR for progress tracking, update `activeUpload` state throughout |
| New UI element | Sticky bottom floating panel showing file name, size, progress bar, status |
| Mobile UX | Panel is always visible regardless of scroll position |

Only one file is modified: `src/pages/InterviewTracking.tsx`. No new dependencies or database changes needed.

