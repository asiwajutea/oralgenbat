

## Plan: Harden Auth Context Against Mobile File Picker Disruption

### Problem
The previous fix (only setting `loading=true` for `SIGNED_IN`/`INITIAL_SESSION`) is insufficient because:

1. Some mobile browsers fire `SIGNED_IN` (not `TOKEN_REFRESHED`) when returning from the file picker, which still sets `loading=true` and unmounts the page
2. The `fetchProfileAndRole` catch block calls `supabase.auth.signOut()` on any unexpected error -- a transient network glitch after backgrounding signs the user out entirely and redirects to `/auth`
3. These two issues combined mean the modal gets destroyed and the page reloads

### Fix

**File: `src/contexts/AuthContext.tsx`**

Three targeted changes:

**Change 1: Only set `loading=true` on the very first session load, never on subsequent events**

Replace the event-based check with a "first load" flag. Once the initial profile is loaded, no auth event should ever set `loading=true` again:

```
// Add a ref to track if initial load is complete
const initialLoadDone = useRef(false);

// In onAuthStateChange:
if (!initialLoadDone.current) {
  setLoading(true);
}
```

This handles the case where mobile browsers fire `SIGNED_IN` instead of `TOKEN_REFRESHED`.

**Change 2: Don't sign out on transient errors in fetchProfileAndRole**

In the catch block (line 98-105), remove the `supabase.auth.signOut()` call. Instead, just log the error and keep the existing profile/role state. Only clear session on explicit auth errors (already handled in the profileError check above).

**Change 3: Mark initial load done in the finally block**

Set `initialLoadDone.current = true` in the finally block so that subsequent calls never trigger `loading=true`.

### What This Changes

| Before | After |
|--------|-------|
| `SIGNED_IN` event sets `loading=true` (even on return from file picker) | Only the very first profile fetch sets `loading=true` |
| Any fetch error signs the user out | Transient errors are logged but user stays signed in with existing data |
| Mobile file picker return can destroy modal | Modal and upload state survive |

### What Stays the Same

- First page load still shows loading spinner until auth is confirmed
- Explicit auth errors (corrupted token, 406, JWT expired) still trigger sign-out
- Profile and role data still refresh silently on token changes
- Sign-in and sign-out flows unchanged
- Inactivity logout timer unchanged

### Technical Details

Only one file changes: `src/contexts/AuthContext.tsx`

- Add `const initialLoadDone = useRef(false)` near the other refs
- Replace `if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')` with `if (!initialLoadDone.current)`
- In the catch block, remove `await supabase.auth.signOut()` and the state clearing calls, replace with just `console.error`
- In the finally block, add `initialLoadDone.current = true`

