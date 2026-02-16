

## Plan: PDF Compression Before Upload + Suspend/Terminate Account Buttons

### 1. Client-Side PDF Compression Before Upload

**Problem:** Large PDFs (over 1.2 MB) are uploaded as-is, consuming excessive storage. They should be compressed below 1 MB while retaining quality before upload.

**Approach:** Use the browser Canvas API to compress PDFs client-side. The flow:
1. Load the PDF using `pdfjs-dist` (from existing `react-pdf` dependency which bundles it)
2. Render each page to a canvas at a reduced scale
3. Export each canvas as a JPEG image (quality ~0.7-0.8)
4. Reassemble into a new PDF using the existing `jspdf` dependency
5. If the result is still over 1 MB, retry with lower quality

**Changes in `src/components/UploadDialog.tsx`:**
- Add a `compressPdf` utility function that takes a `File` and returns a compressed `File`
- In `handleUpload`, before uploading each file, check if `file.size > 1.2 * 1024 * 1024` (1.2 MB)
- If yes, compress and show a "Compressing..." status in the progress UI
- Show original and compressed sizes in a toast notification

**New file: `src/utils/compressPdf.ts`:**
- Import `pdfjs-dist` worker setup (from `react-pdf` package)
- `compressPdf(file: File, targetSizeKB: number): Promise<File>`
  - Load PDF document via `pdfjs-dist`
  - Iterate pages, render to canvas at appropriate scale
  - Use `jsPDF` to create new PDF from canvas images
  - Iteratively reduce JPEG quality if output exceeds target
  - Return new compressed File object

**UI updates in UploadDialog:**
- Show compression progress indicator ("Compressing file 2 of 5...")
- Show file size info: "2.3 MB -> 890 KB" next to each file after compression

---

### 2. Suspend Account and Terminate Account Buttons

**Problem:** Admins can only "Revoke" access (sets `is_approved = false`). Need explicit "Suspend" and "Terminate" actions.

**Database changes:**
- Add `account_status` column to `profiles` table: `text NOT NULL DEFAULT 'active'` (values: `active`, `suspended`, `terminated`)
- Suspended users can log in but see a "Your account is suspended" page
- Terminated users cannot log in at all (treated like unapproved)

**Migration SQL:**
```sql
ALTER TABLE public.profiles 
ADD COLUMN account_status text NOT NULL DEFAULT 'active';
```

**Changes in `src/pages/AdminDashboard.tsx`:**
- Add two new action buttons per user row (for super_admin):
  - "Suspend" button (yellow/warning) -- sets `account_status = 'suspended'`
  - "Terminate" button (red/destructive) -- sets `account_status = 'terminated'` and `is_approved = false`
- Add confirmation dialogs for both actions
- Add "Reactivate" button for suspended/terminated users to restore to active
- Show account status badge in the Status column (Active/Suspended/Terminated)

**Changes in `src/contexts/AuthContext.tsx`:**
- Fetch `account_status` from the profiles table
- Expose `accountStatus` in the auth context
- If `account_status === 'terminated'`, treat as unapproved (redirect to auth)
- If `account_status === 'suspended'`, redirect to a suspended page

**New page: `src/pages/AccountSuspended.tsx`:**
- Simple page showing "Your account has been suspended. Contact your administrator."
- No navigation, just a message and logout button

**Changes in `src/components/ProtectedRoute.tsx`:**
- Check `accountStatus` and redirect suspended users to `/account-suspended`
- Check terminated users redirect to `/auth`

**Route addition in `src/App.tsx`:**
- Add `/account-suspended` route

---

### Technical Summary

| File | Changes |
|------|---------|
| `src/utils/compressPdf.ts` | New utility: PDF compression using pdfjs-dist + jsPDF |
| `src/components/UploadDialog.tsx` | Integrate compression for files > 1.2 MB before upload |
| Database migration | Add `account_status` column to `profiles` table |
| `src/pages/AdminDashboard.tsx` | Add Suspend/Terminate/Reactivate buttons with confirmation dialogs |
| `src/contexts/AuthContext.tsx` | Expose `accountStatus` from profiles |
| `src/components/ProtectedRoute.tsx` | Redirect suspended/terminated users |
| `src/pages/AccountSuspended.tsx` | New page for suspended users |
| `src/App.tsx` | Add `/account-suspended` route |

