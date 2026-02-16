

## Plan: Add PDF Compression to All Upload Dialogs

### Problem
PDF compression was only added to `UploadDialog.tsx`. Two other components that upload PDFs are missing compression:

1. **`BulkPdfUploadDialog.tsx`** (used on the Tracking page) -- uploads PDFs directly without compression
2. **`CombinedUploadDialog.tsx`** (used on the Interviews page for PDF+ZIP uploads) -- uploads PDFs without compression

### Solution
Integrate the existing `compressPdf` utility into both components, matching the pattern already used in `UploadDialog.tsx`.

---

### Technical Details

**File: `src/components/tracking/BulkPdfUploadDialog.tsx`**

- Import `compressPdf`, `shouldCompressPdf`, `formatFileSize` from `@/utils/compressPdf`
- In `processPdfFile()` (around line 147), before the XHR upload, add compression logic:
  - Check `shouldCompressPdf(pdfFile.file)` (file > 1.2 MB)
  - If true, compress using `compressPdf()` and use the compressed file for upload
  - Show a toast with original and compressed sizes
  - Update the status text to show "Compressing..." during compression
- This requires making `pdfFile.file` mutable (use a local `let fileToUpload = pdfFile.file`)

**File: `src/components/CombinedUploadDialog.tsx`**

- Import `compressPdf`, `shouldCompressPdf`, `formatFileSize` from `@/utils/compressPdf`
- In `processFilePair()` (around line 155), before the PDF upload at line 166, add compression:
  - Check `shouldCompressPdf(pair.pdfFile)` (file > 1.2 MB)
  - If true, compress using `compressPdf()` and upload the compressed version
  - Show a toast with size reduction info
  - Update status to indicate compression is happening

### Summary

| File | Change |
|------|--------|
| `src/components/tracking/BulkPdfUploadDialog.tsx` | Add PDF compression before upload in `processPdfFile()` |
| `src/components/CombinedUploadDialog.tsx` | Add PDF compression before upload in `processFilePair()` |

No new dependencies or database changes needed -- just reusing the existing `compressPdf` utility.

