## Fix: Field Audit Check Returning "No Field Audit" for All Interviews

### Root Cause

The edge function logs show: `**AVTool REST query error: 401**`

The AVTool API is rejecting the authentication. This means every interview shows "No Field Audit" regardless of whether the record exists on AVTool.

There are two issues to fix:

### Issue 1: AVTool API Key Authentication (Primary)

The current code sends the API key as a Bearer token:

```
Authorization: Bearer ${avtoolApiKey}
```

If the AVTool project has changed its API key, or if the key was rotated, this would cause a 401. **You'll need to provide the current AVTool API key** so I can update the secret.

### Issue 2: Edge Function Auth Uses Non-Existent Method

The function calls `supabase.auth.getClaims()` which doesn't exist in Supabase JS v2. This should be replaced with `supabase.auth.getUser()` to properly validate the caller's session.

### Issue 3: Logic Should Return `found: true` Regardless of Status

The user's requirement is: "all interviews whose record are on AVTool database will return as audited irrespective of their status." The current code already does this (any row match returns `found: true`), so no logic change needed here — just fixing the 401.

### Changes

**1. `supabase/functions/check-field-audit/index.ts**`

- Replace `getClaims` with `getUser()` for proper auth validation
- Add better error logging (log the response body on 401 to help debug)
- Log the `folder_name` being queried for debugging

**2. Update `AVTOOL_API_KEY` secret**

- If the key has expired or been rotated, you'll need to provide the new key

### Next Step

I need to know: **Has the AVTool API key changed recently?** If so, please provide the updated key so I can update the secret. If you believe the key is still valid, I'll fix the code issues and add logging so we can see the exact error response from AVTool.  
  
The API key did not change and it is stillvalid.