

## Diagnosis: Audio Playback Not Working

### Root Cause

Same issue as the PDF problem fixed earlier: the `interview-audio` storage bucket is **private**, but audio URLs are stored using `getPublicUrl()`. The `<audio>` elements in `AudioPlayerPanel` receive 404 responses, so playback fails and `onLoadedMetadata` never fires (duration stays at 0:00).

### Fix

Run a single SQL update to make the `interview-audio` bucket public, matching the fix already applied to `audit-pdfs`, `mobile-zips`, and `interview-photos`:

```sql
UPDATE storage.buckets SET public = true WHERE id = 'interview-audio';
```

### Impact

- Zero code changes needed
- All existing audio URLs in `interview_metadata` will immediately work
- Audio playback and automatic duration detection in the `AudioPlayerPanel` will function correctly

