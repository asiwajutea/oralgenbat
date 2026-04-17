

## Fix: Switch to AVTool's dedicated `get-field-audit` edge function

### Root Cause (now confirmed)

Our `check-field-audit` function calls AVTool's PostgREST endpoint:
```
GET {AVTOOL_SUPABASE_URL}/rest/v1/interviews?folder_name=eq.{name}
```
That endpoint requires an AVTool Supabase anon/service_role JWT, which we don't have. PostgREST's rejection (`"Invalid API key"`) is what's been blocking us all along.

AVTool exposes a **dedicated edge function** instead: `/functions/v1/get-field-audit` with a simple shared `api_key` header — no JWT needed.

### Changes

**1. `supabase/functions/check-field-audit/index.ts`** — rewrite the AVTool call:
- Endpoint: `POST {AVTOOL_SUPABASE_URL}/functions/v1/get-field-audit`
- Headers: `Content-Type: application/json`, `api_key: {AVTOOL_API_KEY}`
- Body: `{ "folder_name": "<file_name minus .pdf>" }`
- Drop the `Authorization: Bearer ...` header and the `?folder_name=eq...` query
- Map response: `{ found: true, status, reviewed_at, reviewed_by, created_at }` or `{ found: false }`
- Keep structured error reasons (`external_auth_error` on 401, `external_error` on other non-2xx, `external_config_error` if secrets missing)

**2. Secret update**
- The current `AVTOOL_API_KEY` is the wrong type of credential. AVTool's developer mentioned a new `FIELD_AUDIT_API_KEY`. After the code change, ask the user for that shared key and overwrite `AVTOOL_API_KEY` with it (keeping the same secret name to avoid touching more code).

**3. No frontend changes**
- `ReviewInterview.tsx` already handles `found / not_found / external_auth_error / external_config_error` and has the manual retry icon. Nothing to change there.

### Verification Steps (after deploy)

1. Deploy `check-field-audit`.
2. Invoke with `folder_name = NG71_738_20260416_1519` (known-good sample from AVTool) — expect `found: true`.
3. Invoke with the three originally-failing IDs:
   - `NG71_772_20260401_1357`
   - `NG71_772_20260402_1205`
   - `NG71_794_20260306_2321`
4. Open the review page for one of them and confirm the green "Field Audited" badge.

### Files Modified

| File | Change |
|------|--------|
| `supabase/functions/check-field-audit/index.ts` | Switch from PostgREST `/rest/v1/interviews` to edge function `/functions/v1/get-field-audit` with `api_key` header and JSON body |
| Secret `AVTOOL_API_KEY` | Replace value with the new shared `FIELD_AUDIT_API_KEY` from AVTool |

