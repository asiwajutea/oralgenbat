

## Plan: Fix Mobile File Picker Causing Page Remount

### Root Cause

When a mobile user taps a file input, the phone's file picker opens and the browser tab goes to the background. Upon returning, the authentication system fires a token refresh event. The current code treats ALL auth events the same way -- it sets a "loading" state that causes the entire page to unmount and remount. This destroys the open modal and any selected file.

The inactivity logout timer (15 minutes) is not the issue here since the file picker round-trip is fast, but it could also contribute on slower interactions.

### Fix

**File: `src/contexts/AuthContext.tsx`** (the core fix)

In the `onAuthStateChange` handler (around line 112-138), only set `loading = true` for the initial sign-in, not for token refreshes:

- Check the `event` parameter: only set `loading = true` when event is `SIGNED_IN` or `INITIAL_SESSION`
- For `TOKEN_REFRESHED` events, silently refresh the profile in the background without setting `loading = true` -- this prevents route guards from unmounting the page
- The user/session state still gets updated, but since `loading` stays `false`, the route guards won't replace the page with a spinner

**File: `src/contexts/AuthContext.tsx`** (secondary safety)

Similarly, in the `getSession` call (around line 141-163), only set `loading = true` on the very first load (which it effectively already does since it runs once on mount).

### What This Changes

| Before | After |
|--------|-------|
| Any auth event sets `loading = true` | Only `SIGNED_IN` / `INITIAL_SESSION` sets `loading = true` |
| Route guards unmount page on token refresh | Route guards stay stable on token refresh |
| Mobile file picker return kills the modal | Modal and upload state survive |

### What Stays the Same

- Initial page load still shows a loading spinner until auth is confirmed
- Sign-in and sign-out flows work exactly as before
- Profile and role data still refresh on token changes (just silently)
- Inactivity logout timer unchanged

### Technical Details

The change is approximately 5 lines in `AuthContext.tsx`. The `onAuthStateChange` callback receives an `event` string as its first argument (already destructured). We add a condition:

```
if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
  setLoading(true);
}
```

For `TOKEN_REFRESHED`, we still call `fetchProfileAndRole` but skip `setLoading(true)`, so the UI is unaffected.

