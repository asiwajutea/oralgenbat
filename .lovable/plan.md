

## Plan: Fix Metadata Not Updating on Re-upload

### Root Cause

Two issues prevent metadata from updating when re-uploaded:

1. **Wrong parameter name in InterviewTracking.tsx** (line 827): Passes `zipUrl` instead of `mobileZipUrl` to the `process-mobile-zip` edge function. The edge function requires `mobileZipUrl`, so it throws "Missing required parameters" and metadata is never re-processed. This affects single metadata uploads from the Interview Tracking page.

2. **Stale React Query cache**: After metadata is re-processed by the edge function from other upload components (FailedInterviewModal, BulkMetadataUploadDialog, etc.), none of them invalidate the `["interview-metadata", auditId]` cache. When an auditor navigates to the review page, they may see stale cached data until the next hard refresh.

### Changes

**File: `src/pages/InterviewTracking.tsx`** (line 827)
- Fix parameter name: change `zipUrl` to `mobileZipUrl` in the edge function invocation body

**File: `src/components/tracking/FailedInterviewModal.tsx`**
- In the `submitMutation` `onSuccess` callback (line 241): add `queryClient.invalidateQueries({ queryKey: ["interview-metadata"] })` to clear all cached metadata

**File: `src/components/tracking/BulkMetadataUploadDialog.tsx`**
- After bulk upload completes: add metadata cache invalidation

**File: `src/components/BulkZipUploadDialog.tsx`**
- After bulk upload completes: add metadata cache invalidation

**File: `src/components/CombinedUploadDialog.tsx`**
- After upload completes: add metadata cache invalidation

**File: `src/components/AuditTable.tsx`**
- After ZIP upload handler completes: add metadata cache invalidation

All invalidations will use a broad `queryKey: ["interview-metadata"]` (without specific auditId) to ensure any cached metadata is refreshed, since bulk uploads affect multiple audits.

