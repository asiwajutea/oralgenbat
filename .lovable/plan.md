

## Plan: Switch All AI from Lovable AI Gateway to OpenAI API

6 edge functions currently use the Lovable AI gateway with `LOVABLE_API_KEY`. This plan switches all of them to use the OpenAI API directly with your own API key.

---

### Step 1: Store Your OpenAI API Key

Use the `add_secret` tool to securely store your OpenAI API key as `OPENAI_API_KEY`, accessible to all edge functions.

### Step 2: Update All 6 Edge Functions

Each function gets the same 3 changes:
1. Read `OPENAI_API_KEY` instead of `LOVABLE_API_KEY`
2. Call `https://api.openai.com/v1/chat/completions` instead of `https://ai.gateway.lovable.dev/v1/chat/completions`
3. Switch model to `gpt-4o` (or `gpt-4o-mini` for lighter tasks)

**Files to update:**

| File | Current Model | New Model | Purpose |
|------|--------------|-----------|---------|
| `supabase/functions/suggest-error-fix/index.ts` | `gemini-3-flash-preview` | `gpt-4o-mini` | Error console AI fix suggestions |
| `supabase/functions/fraud-analysis/index.ts` | `gemini-2.5-flash` | `gpt-4o` | Fraud report generation |
| `supabase/functions/analyze-pdf/index.ts` | `gemini-2.5-flash` | `gpt-4o` | PDF quality analysis |
| `supabase/functions/regenerate-audio-summary/index.ts` | `gemini-2.5-flash` | `gpt-4o-mini` | Audio quality summaries |
| `supabase/functions/process-mobile-zip/index.ts` | `gemini-2.5-flash` | `gpt-4o-mini` | ZIP upload audio summary |
| `supabase/functions/parse-invoice-pdf/index.ts` | `gemini-2.5-flash` | `gpt-4o` | Invoice PDF parsing |

Model selection rationale: `gpt-4o` for complex analysis (fraud, PDF analysis, invoice parsing) and `gpt-4o-mini` for simpler summaries (audio, error fixes) to balance cost and quality.

### Example Change Pattern

```typescript
// Before
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
  headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
  body: JSON.stringify({ model: "google/gemini-2.5-flash", ... }),
});

// After
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const response = await fetch("https://api.openai.com/v1/chat/completions", {
  headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
  body: JSON.stringify({ model: "gpt-4o", ... }),
});
```

Error handling for 429 (rate limit) and 402 (billing) remains the same since OpenAI uses the same HTTP status codes.

---

### Technical Summary

| Area | Change |
|------|--------|
| Secret | Add `OPENAI_API_KEY` |
| 6 edge functions | Swap URL, key, and model name |
| No client-side changes | All AI calls go through edge functions already |

