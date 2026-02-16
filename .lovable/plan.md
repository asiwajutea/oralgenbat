

## Plan: Add Per-File Cancel/Remove Buttons to All Upload Dialogs

### Problem
After selecting files for upload across all batch upload dialogs, there is no way to remove individual unwanted files from the list before uploading. Users must re-select all files from scratch if they accidentally included one they don't want.

### Solution
Add a small "X" (remove) button next to each file in the selected file list, visible only before the upload starts (not during or after upload). Clicking it removes that specific file from the batch.

---

### Files to Modify

#### 1. `src/components/UploadDialog.tsx` (Interviews page - PDF upload)
- Add an `X` button next to each file in the `<li>` element (line 315-328)
- On click, filter that file out of `selectedFiles` state
- Hide the button while `isUploading` is true
- Update the file input to allow re-selection (reset input value)

#### 2. `src/components/CombinedUploadDialog.tsx` (Interviews page - PDF + ZIP upload)
- Add an `X` button next to each file pair in the visible pairs list
- On click, remove the pair and also remove the corresponding file from `pdfFiles` and/or `zipFiles` arrays, then recalculate `filePairs`
- Hide while uploading

#### 3. `src/components/BulkZipUploadDialog.tsx` (Interviews page - Bulk ZIP upload)
- Add an `X` button next to each ZIP file in the list (line 356-368)
- On click, filter that file out of `zipFiles` state
- Hide while uploading

#### 4. `src/components/tracking/BulkPdfUploadDialog.tsx` (Tracking page - Bulk PDF upload)
- Add an `X` button next to each PDF file in the list (line 456-470 area)
- On click, filter that file out of `pdfFiles` state
- Hide while uploading

#### 5. `src/components/tracking/BulkMetadataUploadDialog.tsx` (Tracking page - Bulk Metadata upload)
- Add an `X` button next to each ZIP file in the list (line 494-510 area)
- On click, filter that file out of `zipFiles` state
- Hide while uploading

---

### UI Pattern (same across all dialogs)

Each file row will get a small ghost-variant X button on the right side, only visible when:
- The file status is `"pending"` (not yet uploading, not completed, not errored)
- `isUploading` is false

```
[StatusIcon] filename.pdf        [Badge] [X]
```

The X button will use the existing `X` icon from lucide-react (already imported in most files) with `variant="ghost"` and `size="icon"` styling, sized small (`h-6 w-6`) to fit inline.

### Technical Details

- **UploadDialog**: `removeFile(index)` filters `selectedFiles` by index
- **CombinedUploadDialog**: `removePair(fileName)` filters `filePairs` by fileName, and also removes from `pdfFiles`/`zipFiles` source arrays
- **BulkZipUploadDialog**: `removeFile(fileName)` filters `zipFiles` by fileName
- **BulkPdfUploadDialog**: `removeFile(fileName)` filters `pdfFiles` by fileName
- **BulkMetadataUploadDialog**: `removeFile(fileName)` filters `zipFiles` by fileName

No database changes or new dependencies needed.

