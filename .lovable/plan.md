

## Plan: Switch to Free OpenRouter Model

Update all 6 edge functions to use the free model `openai/gpt-oss-120b:free` instead of `gpt-4o`/`gpt-4o-mini`.

### Changes

| File | Current Model | New Model |
|------|--------------|-----------|
| `supabase/functions/suggest-error-fix/index.ts` | `gpt-4o-mini` | `openai/gpt-oss-120b:free` |
| `supabase/functions/fraud-analysis/index.ts` | `gpt-4o` | `openai/gpt-oss-120b:free` |
| `supabase/functions/analyze-pdf/index.ts` | `gpt-4o` | `openai/gpt-oss-120b:free` |
| `supabase/functions/regenerate-audio-summary/index.ts` | `gpt-4o-mini` | `openai/gpt-oss-120b:free` |
| `supabase/functions/process-mobile-zip/index.ts` | `gpt-4o-mini` | `openai/gpt-oss-120b:free` |
| `supabase/functions/parse-invoice-pdf/index.ts` | `gpt-4o` | `openai/gpt-oss-120b:free` |

### What Changes Per File

Each function gets a single-line model swap:
```typescript
// Before
model: "gpt-4o",  // or "gpt-4o-mini"

// After
model: "openai/gpt-oss-120b:free",
```

No other code changes needed — the OpenRouter endpoint and API key are already configured correctly.

### Notes

- Free tier models have stricter rate limits, so the existing 429 error handling will be important.
- The `reasoning` parameter from the screenshot is optional and not needed for these use cases (they are single-shot analysis tasks, not multi-turn conversations).
- All 6 functions will be redeployed after the update.

