---
name: jobzero
license: MIT
description: >
  JobZero AI career assistant -- add and search tracked job postings, score candidate fit, generate grounded tailored resumes with diff review, approve PDFs, and retrieve pre-filled application answers via MCP tools.
user-invocable: true
argument-hint: "[profile | verify | add | search | score | tailor | approve | prefill]"
---

# JobZero Skill Playbook

Use the JobZero MCP tools to help the user evaluate job postings, score role fit, tailor their resume with human-in-the-loop diff verification, and prepare application answers.

---

## 1. Setup & Authentication

Generate an API token under **JobZero → Agents** (`https://www.jobzero.app/agents`). The token (`jzat_…`) is shown once; it works only with the MCP server, and you can regenerate or revoke it there at any time. Keep it in local configuration or environment variables; never paste it into public chat prompts.

### Claude Code (1-Click Terminal Setup)
```bash
claude mcp add --transport http jobzero https://api.jobzero.app/api/mcp -H "Authorization: Bearer <YOUR_JOBZERO_API_TOKEN>"
```

### Cursor / Claude Desktop (`.cursor/mcp.json` or `claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "jobzero": {
      "url": "https://api.jobzero.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_JOBZERO_API_TOKEN>"
      }
    }
  }
}
```

---

## 2. When the user asks what JobZero can do

For "What can I do with JobZero?" (or "help", "what can you do?"), call `jobzero_get_profile_and_quota` and answer briefly in plain language, using their name and remaining quota:

- **Check a job link**: is it still open, and a quick read of the role (`jobzero_verify_and_add_job`, or `jobzero_add_jobs` for several).
- **Score your fit**: a 1.0–5.0 FitScore with the reasons, against your own profile (`jobzero_score_jobs`).
- **Find jobs you already track**: e.g. "my best matches at Stripe this week" (`jobzero_search_jobs`).
- **Tailor your resume** for a role: you review every change before it is used (`jobzero_tailor_resume`, then `jobzero_approve_resume`).
- **Get application answers** pre-filled for a job's form (`jobzero_get_prefill_payload`).

End with one suggestion they can say next, such as "Paste a job link and I'll check it and score your fit." Never submit an application for them.

---

## 3. Standard 5-Step Agent Workflow

When a user gives you a job posting URL or asks to evaluate/apply to a role, follow this sequence:

1. **Verify & Add Job**:
   - Call `jobzero_verify_and_add_job({ url })`.
   - Confirm the posting is live and share the `quickRead` summary (`scannable_summary`, `ownership_mandate`, `core_tech_and_tools`, `minimum_experience_years`).

2. **Score Fit**:
   - Call `jobzero_score_jobs({ jobId })` using the `job.id` returned in Step 1.
   - Present the overall `fitScore` (1.0–5.0), `recommendation`, the 4 pillar scores (`role_seniority_score`, `skills_tech_score`, `domain_context_score`, `recency_impact_score`), and the `fit_summary`.

3. **Tailor Resume**:
   - If the user wants to tailor their resume (or if `fitScore` meets their target threshold, e.g. `>= 3.5`), call `jobzero_tailor_resume({ jobId })`.

4. **Human-in-the-Loop Diff Review (Required)**:
   - Always show the user each proposed diff hunk in `hunks` (`before` → `after`) and any verification items in `flags`.
   - Do **not** call `jobzero_approve_resume` until the user has reviewed the changes and confirmed which hunks/flags to accept.

5. **Approve & Export**:
   - Once the user confirms, call `jobzero_approve_resume({ jobId, acceptedHunkIds, rejectedHunkIds, confirmedFlagIds })`.
   - Share the compiled `pdfUrl` and `jobUrl` with the user.
   - If the user asks for pre-filled application form answers, call `jobzero_get_prefill_payload({ jobId })`.

### Adding several jobs at once
When the user pastes multiple links ("add these 5 roles and score them"):
- Call `jobzero_add_jobs({ jobs: [url1, url2, ...], score: true })` (max 10 per call; split longer lists).
- Report per-job results: added, failed (with `error`), and scores.
- For any result with `requires_manual_jd: true`, ask the user to paste that job's description, then retry it with `jobzero_verify_and_add_job({ url, jdText })`.

### Finding & browsing tracked jobs
When the user asks about jobs already in their JobZero feed ("my strong fits at Stripe", "remote senior roles posted this week", "which jobs need Kubernetes?", "what did the last scan find?"):
- Call `jobzero_search_jobs` with the matching filters, e.g. `{ company: "stripe", minScore: 4 }`, `{ location: "remote", seniority: "senior", postedWithinDays: 7 }`, `{ tech: ["kubernetes"] }`, or `{ newSinceLastScan: true }`.
- Start with the default `detail: "summary"`, present the matches as a short ranked list, and page with `offset` when `hasMore` is true.
- Use `detail: "full"` (or `jobIds: [...]` with `detail: "full"`) when the user wants to compare roles or dig into specific ones.
- Continue into the standard workflow from step 2 or 3 for the roles the user picks (e.g. "tailor my resume for the top 3").

---

## 4. MCP Tool Reference

### `jobzero_get_profile_and_quota`
Returns the user's profile summary, subscription tier, and remaining monthly quotas.
- **Input**: `{}`
- **Output**: `{ profile: { id, name, email, targetRoles, targetCities }, subscription: { tier, isActive }, quota: { monthlyResumesRemaining, monthlyScoresRemaining, monthlyTokensRemaining }, upgradeUrl }`

### `jobzero_verify_and_add_job`
Verifies a job posting URL, extracts job details, and adds it to the user's JobZero feed.
- **Input**: `{ url: string, company?: string, role?: string, location?: string, jdText?: string }`
- **Output**: `{ job: { id, title, company, portal, location }, quickRead: { scannable_summary, ownership_mandate, core_tech_and_tools, minimum_experience_years }, requires_manual_jd?: true, hint?: string }`

### `jobzero_add_jobs`
Adds up to 10 job postings in one call; optionally scores them. One failing URL does not fail the batch.
- **Input**: `{ jobs: Array<string | { url, company?, role?, location?, jdText? }>, score?: boolean }`
- **Output**: `{ added: number, failed: number, results: Array<{ url, ok, job?, quickRead?, requires_manual_jd?, error?, fitScore?, recommendation?, fit_summary? }>, scoring?: { scoredCount } | { skipped: true, reason } }`

### `jobzero_search_jobs`
Searches the user's own tracked jobs (their JobZero feed). All filters are optional and combine with AND.
- **Input**: `{ jobIds?, query?, company?, title?, location?, status?, minScore?, maxScore?, scored?, recommendation?, seniority?, domain?, tech?: string[], maxMinYoe?, postedWithinDays?, newSinceLastScan?, hasTailoredResume?, includeExpired?, sortBy?: "score" | "posted" | "scanned" | "company", sortDir?: "asc" | "desc", detail?: "summary" | "full", limit?, offset? }`
- **Output**: `{ total, count, offset, hasMore, jobs: Array<{ id, title, company, location, url, status, fitScore, recommendation, fit_summary, postedAt, daysSincePosted, seniority, domain, tailoredResume }> }`. With `detail: "full"`, each job also includes `quickRead`, `fitBreakdown`, `compensation`, `hardConstraints`, `evaluation`, and `application`.

### `jobzero_score_jobs`
Scores one or more jobs against the user's profile on a 1.0–5.0 scale.
- **Input**: `{ jobId?: number, jobIds?: number[], company?: string }`
- **Output**: `{ scoredCount: number, jobs: Array<{ id, title, company, fitScore, recommendation, fitBreakdown: { role_seniority_score, skills_tech_score, domain_context_score, recency_impact_score }, fit_summary }> }`

### `jobzero_tailor_resume`
Generates a tailored resume draft and returns proposed diff hunks and verification flags.
- **Input**: `{ jobId: number, mode?: "RESUME_ONLY" | "ALL", regenerate?: boolean }`
- **Output**: `{ jobId: number, status: string, hunks: Array<{ id, section, roleTitle, type, before, after }>, flags: Array<{ id, type, severity, text, details }>, tailoredResumeMd: string, coverLetterMd?: string, customAnswers?: Record<string, string> }`

### `jobzero_approve_resume`
Applies the user's accepted/rejected hunks and confirmed flags, compiles the final PDF, and returns the download and application links.
- **Input**: `{ jobId: number, acceptedHunkIds?: string[], rejectedHunkIds?: string[], confirmedFlagIds?: string[] }`
- **Output**: `{ success: boolean, status: "APPROVED", pdfUrl: string, applyAction: "EXTERNAL_APPLY" | "AI_APPLY_QUEUED", jobUrl?: string, applicationId?: number }`

### `jobzero_get_prefill_payload`
Returns pre-filled application form answers and discovered questions for the job.
- **Input**: `{ jobId: number }`
- **Output**: `{ fields: Record<string, any>, labels: Record<string, string>, discoveredQuestions: Array<{ key, label, type, required, options }>, resumePdfUrl?: string }`
