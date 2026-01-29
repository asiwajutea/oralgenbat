
# Implementation Plan: Multi-Issue Fix

## Overview
This plan addresses four distinct issues across multiple pages: ZIP Diagnostics query failures, action plan validation, PDF export filtering, and PDF export content formatting.

---

## 1. ZIP File Diagnostics - Query Fix

### Problem
The "Photos query failed: Bad Request" error occurs because there are 667 audit IDs being passed to the `.in()` operator, which exceeds PostgreSQL's query parameter limits for large arrays.

### Solution
**Location**: `src/pages/ZipDiagnostics.tsx` (lines 112-118)

Batch the queries for metadata and photos into chunks of 100-200 IDs to avoid hitting the query parameter limit. Also, add better error handling so the page still functions even if one query fails.

**Changes**:
1. Create a helper function to batch audit IDs into chunks
2. Execute multiple queries in parallel for each chunk
3. Combine the results
4. Add fallback behavior so the page works even if the photos query fails (metadata query is the critical one)

```typescript
// Helper to batch queries
const batchQuery = async (auditIds: string[], tableName: string) => {
  const BATCH_SIZE = 200;
  const results: any[] = [];
  
  for (let i = 0; i < auditIds.length; i += BATCH_SIZE) {
    const batch = auditIds.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from(tableName)
      .select("audit_id")
      .in("audit_id", batch);
    
    if (data) results.push(...data);
  }
  
  return results;
};
```

---

## 2. Interview Review - Make Action Plan Optional

### Problem
When failing an interview, the action plan field is currently mandatory (requires at least 10 characters). The user wants this to be optional.

### Solution
**Location**: `src/components/review/ReviewActions.tsx` (lines 170-178)

Remove the validation check for `actionPlan` minimum length. The artifact selection and review comment remain required.

**Current Code**:
```typescript
if (actionPlan.trim().length < 10) {
  toast({
    title: "Validation Error",
    description: "Please provide a detailed action plan (at least 10 characters).",
    variant: "destructive",
  });
  return;
}
```

**Change**: Remove this validation block entirely. The action plan will be submitted as-is (can be empty).

**Also update**:
- Remove the `*` from the action plan label to indicate it's optional
- Update placeholder text to indicate optionality

---

## 3. Admin Review History - PDF Export Filter Fix

### Problem
The PDF export function doesn't handle the new artifact-based status filters (`failed_pdf`, `failed_metadata`, `failed_both`). It just passes the raw filter value to `.eq("status", ...)` which returns no results.

### Solution
**Location**: `src/pages/AdminReviewHistory.tsx` (lines 479-482)

Apply the same filter logic used in the main query (lines 235-244) to the PDF export query.

**Current Code**:
```typescript
if (statusFilter !== "all") query = query.eq("status", statusFilter as "Audit Passed" | "Audit Failed");
```

**Updated Code**:
```typescript
if (statusFilter !== "all") {
  if (statusFilter === "failed_pdf") {
    query = query.eq("status", "Audit Failed").contains("artifact_correction", ["scanned_pdf"]);
  } else if (statusFilter === "failed_metadata") {
    query = query.eq("status", "Audit Failed").contains("artifact_correction", ["mobile_metadata"]);
  } else if (statusFilter === "failed_both") {
    query = query.eq("status", "Audit Failed").contains("artifact_correction", ["scanned_pdf", "mobile_metadata"]);
  } else {
    query = query.eq("status", statusFilter as "Audit Passed" | "Audit Failed");
  }
}
```

Apply the same fix to:
- `exportToCSV` function (line 389)
- `exportToExcel` function (line 430)

---

## 4. Admin Review History - PDF Export Content Overhaul

### Problem
The PDF export currently includes the checklist questions and headers. The user wants feedback statements instead, with specific predefined messages for each checklist question failure.

### Required Data
The PDF export needs to include:
- Interviewee name
- Total names
- Age
- First ancestor name

These are in the `interview_metadata` table, so the query needs to be updated.

### Solution
**Location**: `src/pages/AdminReviewHistory.tsx` (lines 466-631)

#### 4.1 Update Query to Include Metadata
```typescript
interview_metadata(contractor_id, interviewee_name, total_names, interviewee_age, first_ancestor)
```

#### 4.2 Create Feedback Statement Mapping
Create a constant object mapping question IDs to their feedback statements:

```typescript
const CHECKLIST_FEEDBACK_STATEMENTS: Record<number, string> = {
  1: "The interview failed because it was not recorded on the FSI Standard Interview Collection Form or an incorrect form was submitted. Please ensure the interview is properly documented using the approved FSI Standard Interview Collection Form and resubmit for review.",
  2: "The interview failed because the Authorization Form is incomplete, missing a signature and/or date, or a required witness signature is absent where \"X\" was used. Please obtain all required signatures and dates and resubmit the completed Authorization Form.",
  3: "The interview failed because the Field Manager Checklist was not fully completed and/or signed. Please ensure all required checklist items are checked and the form is properly signed before resubmission.",
  4: "The interview failed because the interviewee's name and/or age on the collection form header and Authorization Form do not match the information recorded in the mobile app. Please correct the discrepancies so all records are consistent and resubmit for review.",
  5: "The interview failed because the total number of names recorded on the form header does not match the total number of names written on the collection form or the Mobile App data. Please reconcile the counts and update the documentation accordingly.",
  6: "The interview failed because the earliest ancestor's name on the collection form does not match the information entered in the mobile app. Please review and correct the ancestor details so both records align.",
  7: "The interview failed because one or more individuals listed on the collection form are missing a unique RIN, relationship code, and/or gender, or the information is duplicated or incorrect. Please ensure all required identifiers are accurately completed for every individual.",
  8: "The interview failed because the dates and/or places of birth for the interviewee, spouse, or children are missing or incomplete. Please provide complete birth information for all required individuals and resubmit the interview.",
  9: "The interview failed because the folder name recorded on the collection form header does not match the interview date and/or interview ID. Please correct the folder naming to reflect the accurate interview details.",
  10: "The interview failed because the pages are not numbered correctly or are out of sequence. Please renumber the pages in the correct order and ensure the full document is complete before resubmission.",
  11: "The interview failed because one or more photos uploaded in the mobile app are unclear, incomplete, irrelevant, or improperly captured. Please retake and upload clear, complete, and relevant photos as required.",
  12: "The interview failed because the Authorization Form image is incomplete, unclear, or partially obscured, making it unreadable. Please upload a clear image showing the full Authorization Form.",
  13: "The interview failed because the audio recordings are unclear, incomplete, or inaudible, making it difficult to hear the Field Agent and/or interviewee. Please ensure all required audio recordings are clear and fully audible before resubmission.",
};
```

#### 4.3 Create Feedback Parser Function
Parse the `review_comment` field to extract which questions failed and their additional comments:

```typescript
const parseChecklistFeedback = (reviewComment: string): Array<{questionId: number; additionalComment?: string}> => {
  // The review_comment contains markdown like:
  // **Failed Checklist Items:**
  // **Documentation & Authorization:**
  // - Q1: Was the interview recorded...
  //   Comment: Some additional comment
  
  const failures: Array<{questionId: number; additionalComment?: string}> = [];
  
  // Match patterns like "Q1:", "Q2:", etc.
  const questionMatches = reviewComment.matchAll(/- Q(\d+):/g);
  
  for (const match of questionMatches) {
    const questionId = parseInt(match[1]);
    // Extract comment if present (follows the question)
    const afterQuestion = reviewComment.substring(match.index! + match[0].length);
    const commentMatch = afterQuestion.match(/Comment: ([^\n]+)/);
    
    failures.push({
      questionId,
      additionalComment: commentMatch?.[1]?.trim(),
    });
  }
  
  return failures;
};
```

#### 4.4 Update PDF Rendering Logic
For each failed audit, instead of dumping the raw `review_comment`:
1. Add metadata info (interviewee name, total names, age, first ancestor)
2. Parse the checklist failures
3. For each failed question, output the predefined feedback statement
4. If there's an additional comment, add it below
5. If action plan exists, add it at the end

**PDF Entry Format**:
```text
1. NG71_730_20260103_1036
Status: Failed | Reviewer: John Doe | Duration: 5m 23s
Date: January 28, 2026, 4:50 PM
Interviewee: Jane Smith | Age: 45 | Total Names: 32 | First Ancestor: Ancestor Name

Feedback:
[Predefined feedback statement for Q1]
Additional Comment: [User's comment if any]

[Predefined feedback statement for Q5]

Action Plan: [Action plan if provided]
```

---

## Summary of Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ZipDiagnostics.tsx` | Batch queries to avoid "Bad Request" errors |
| `src/components/review/ReviewActions.tsx` | Make action plan optional |
| `src/pages/AdminReviewHistory.tsx` | Fix artifact filters in export, overhaul PDF content |

---

## Technical Implementation Details

### ZIP Diagnostics Batching Pattern
```typescript
const BATCH_SIZE = 200;
const chunks = [];
for (let i = 0; i < auditIds.length; i += BATCH_SIZE) {
  chunks.push(auditIds.slice(i, i + BATCH_SIZE));
}

// Query each chunk in parallel
const allMetadata = await Promise.all(
  chunks.map(chunk => 
    supabase
      .from("interview_metadata")
      .select("audit_id")
      .in("audit_id", chunk)
  )
);

// Combine results
const metadata = allMetadata.flatMap(r => r.data || []);
```

### Action Plan Validation Removal
Lines 170-178 in ReviewActions.tsx will be deleted entirely, and the label on line 406 updated from `"Action Plan for Correction *"` to `"Action Plan for Correction (Optional)"`.

### PDF Export Filter Synchronization
The same conditional logic used in the main data query (lines 236-244) must be replicated in all three export functions (CSV, Excel, PDF).
