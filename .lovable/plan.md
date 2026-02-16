

## Plan: Connect Oralgenbat to AVTool for Field Audit Lookup

### How It Works

When an auditor opens the Review Interview page in Oralgenbat, the app will check AVTool's database to see if a field audit record exists for that interview ID. If found, a badge/banner will appear showing "Field Audited" with the audit date and status.

### Architecture

The connection works in two steps:

1. **AVTool** needs a new edge function that accepts an interview ID and returns the field audit record (you'll create this in the AVTool project)
2. **Oralgenbat** calls that edge function and displays the result on the review page

```text
Oralgenbat (Review Page)
    |
    |-- Edge Function: check-field-audit
    |       |
    |       |-- HTTP call to AVTool edge function
    |       |
    v
AVTool (Edge Function: get-field-audit)
    |
    |-- Queries AVTool's audits table by folder_name
    |
    v
Returns: { found: true, status, reviewed_at, reviewed_by, ... }
```

### Step-by-Step

#### Step 1: Create edge function in AVTool (you do this in the AVTool project)

You'll need to go to [OralGen AVTool](/projects/3daf200c-dd78-4f5a-aa4f-10ebcf86b789) and ask Lovable to create an edge function called `get-field-audit` that:
- Accepts a `folder_name` parameter (the interview ID)
- Queries the AVTool `audits` table for a matching record
- Returns the audit status, reviewed_at, reviewed_by, and created_at
- Does NOT require JWT (so Oralgenbat can call it), but uses a shared API key for security

You can copy-paste this prompt into the AVTool project:

> "Create an edge function called `get-field-audit` that accepts a JSON body with `folder_name` (string) and an optional `api_key` header for security. It should query the `audits` table for a record matching that folder_name. Return `{ found: true, status, reviewed_at, reviewed_by, created_at }` if found, or `{ found: false }` if not. Set verify_jwt = false in config.toml. Include CORS headers."

#### Step 2: Store AVTool credentials in Oralgenbat (secrets)

After the AVTool edge function is deployed, we need to store:
- `AVTOOL_SUPABASE_URL` -- the AVTool project URL (https://cajuhevrfsqjnyaajloi.supabase.co)
- `AVTOOL_API_KEY` -- a shared secret key that both apps know, to prevent unauthorized access

#### Step 3: Create edge function in Oralgenbat

Create `supabase/functions/check-field-audit/index.ts` that:
- Receives the interview `file_name` from Oralgenbat's frontend
- Extracts the folder name (interview ID) from the file_name
- Calls AVTool's `get-field-audit` edge function
- Returns the result to the frontend

#### Step 4: Update the Review Interview page

**File: `src/pages/ReviewInterview.tsx`**
- Add a `useQuery` hook that calls the `check-field-audit` edge function with the audit's `file_name`
- Display a badge/banner near the interview title showing:
  - A green "Field Audited" badge with the date if a record is found
  - Nothing if no record is found (no clutter)

**Visual result on the review page:**
```text
NG71_650_20250120_1234        [Field Audited - Jan 25, 2025] [Audit Passed]
```

### What You Need To Do First

Before I can implement steps 2-4, you need to:

1. Go to the **AVTool** project and create the `get-field-audit` edge function (using the prompt above)
2. Decide on a shared API key (a random string) that both apps will use for security
3. Come back here and tell me it's ready -- I'll then set up the secrets and build the integration

### Technical Details

| Component | Location | Purpose |
|-----------|----------|---------|
| `get-field-audit` edge function | AVTool project | Exposes field audit data via HTTP |
| `AVTOOL_API_KEY` secret | Oralgenbat secrets | Shared key for secure cross-app calls |
| `check-field-audit` edge function | Oralgenbat project | Proxy that calls AVTool |
| `useQuery` hook | ReviewInterview.tsx | Fetches and caches field audit status |
| Field Audit Badge | ReviewInterview.tsx | Visual indicator on the review page |

- The edge function call is lightweight (single DB lookup) so it won't slow down page load
- Results are cached per interview ID so repeated visits don't re-fetch
- The shared API key prevents random people from querying your audit data
- No database changes needed in either project

