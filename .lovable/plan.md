

## Diagnosis: PDF "Failed to Load" on Review Page

### Root Cause

The `audit-pdfs` storage bucket is **private**, but the application stores and uses **public URLs** (`getPublicUrl()`) to access PDFs. Public URLs only work on public buckets — private buckets return a 404 "Bucket not found" error.

This affects **every PDF in the system**, not just NG71_796_20260320_1347.

### Why It Happened

Across at least 7 files, PDFs are uploaded and their URLs saved using `supabase.storage.from("audit-pdfs").getPublicUrl(path)`. This generates a URL like:
```
https://xxx.supabase.co/storage/v1/object/public/audit-pdfs/file.pdf
```
That `/public/` path is rejected by the storage server when the bucket is private.

### Fix Options

**Option A (Recommended): Make the bucket public**

A single database migration sets the bucket to public. This is the simplest fix and matches how the entire codebase already works — all upload flows store public URLs and the PDF viewer, diagnostics, downloads, and exports all use those URLs directly.

- One SQL statement: `UPDATE storage.buckets SET public = true WHERE id = 'audit-pdfs'`
- Zero code changes needed
- All existing `file_url` values in the `audits` table will immediately start working

**Option B: Switch to signed URLs**

Keep the bucket private and generate short-lived signed URLs on demand. This would require:
- Modifying `PDFViewer` to accept and use signed URLs
- Modifying `ReviewInterview.tsx` to generate a signed URL before rendering
- Modifying every upload flow (7+ files) to stop storing public URLs
- Modifying every place that reads `file_url` to generate signed URLs instead
- Signed URLs expire, so downloads/exports would need re-signing logic

This is significantly more work and the bucket doesn't contain sensitive data that requires private access (it's already behind authentication in the app).

### Recommended Plan

1. **Create a migration** to set `audit-pdfs` bucket to public
2. **Verify** the same for `mobile-zips` and `interview-photos` (which likely have the same issue if they're also private)
3. No client-side code changes required

### Technical Detail

```sql
UPDATE storage.buckets SET public = true WHERE id = 'audit-pdfs';
UPDATE storage.buckets SET public = true WHERE id = 'mobile-zips';
UPDATE storage.buckets SET public = true WHERE id = 'interview-photos';
```

All three buckets already have their URLs stored as public URLs throughout the codebase, so this aligns storage configuration with existing application behavior.

