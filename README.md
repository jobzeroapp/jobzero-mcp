# JobZero MCP

Use [JobZero](https://www.jobzero.app) from your AI assistant. Connect once, then check job links, score your fit, tailor your resume, and prepare application answers from a chat.

This repo holds the public setup for JobZero's hosted MCP (Model Context Protocol) server: the agent skill, the MCP Registry entry, and an optional stdio bridge. The server itself is hosted by JobZero, so there is nothing to deploy.

- **Endpoint:** `https://api.jobzero.app/api/mcp`
- **Transport:** Streamable HTTP
- **Auth:** Bearer API token
- **Setup guide:** <https://www.jobzero.app/mcp>

## Quick start

### 1. Create an API token

You need a free JobZero account. Sign in and generate a token on the [Agents page](https://www.jobzero.app/agents). The token only works with the JobZero MCP server, and you can revoke it at any time.

Keep it in your assistant's configuration. Never paste it into a chat message.

### 2. Connect your assistant

**Muse, Instinct, and other chat assistants**

Paste this into a chat. When it asks for your token, enter it in the secure credentials prompt, never in the chat.

```text
Connect to the JobZero MCP server at https://api.jobzero.app/api/mcp. It needs my JobZero API token as a Bearer token in the Authorization header. Ask for the token through your secure credentials prompt, not in this chat. Then read https://www.jobzero.app/skill.md for how to use it.
```

**Claude Code**

Run this once. It connects JobZero and installs the skill.

```bash
claude mcp add --transport http jobzero https://api.jobzero.app/api/mcp -H "Authorization: Bearer <YOUR_JOBZERO_API_TOKEN>" && mkdir -p ~/.claude/skills/jobzero && curl -fsSL https://www.jobzero.app/skill.md -o ~/.claude/skills/jobzero/SKILL.md
```

**Cursor, Claude Desktop, and other MCP clients**

Add this to `.cursor/mcp.json`, your Claude Desktop config, or your client's MCP settings.

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

### 3. Ask your assistant

Start with "What can I do with JobZero?", or try:

- "Is this job still open? `<job link>`"
- "Score my fit for `<job link>`"
- "Show my best matches at Stripe from this week"
- "Tailor my resume for my top match"
- "Get my answers for this application form"

## Tools

| Tool | What it does |
|---|---|
| `jobzero_get_profile_and_quota` | Your profile summary and remaining plan limits |
| `jobzero_verify_and_add_job` | Checks that a job link is live and adds it with a JobQuickRead™ |
| `jobzero_add_jobs` | Adds up to 10 job postings per call, optionally scoring them |
| `jobzero_search_jobs` | Searches your tracked jobs by company, location, score, seniority, technology, and recency |
| `jobzero_score_jobs` | Scores your fit from 1.0 to 5.0 with a FitScore™ |
| `jobzero_tailor_resume` | Tailors your resume for a job and returns changes to review |
| `jobzero_approve_resume` | Applies the changes you accepted and returns the resume PDF |
| `jobzero_get_prefill_payload` | Prepares answers for a job's application form |

Inputs and outputs are documented in the [skill](skills/jobzero/SKILL.md).

## You stay in control

- Your assistant shows you resume changes and waits for your OK before approving them.
- The skill tells assistants never to submit an application for you.
- Scores and tailored resumes made from your assistant count toward your JobZero plan, just like in the app. Chat usage is billed by your assistant, not JobZero. See [pricing](https://www.jobzero.app/pricing).

## What's in this repo

| Path | Purpose |
|---|---|
| `skills/jobzero/SKILL.md` | Agent skill: when to use each tool and how to review changes with the user |
| `mcp/server.json` | [MCP Registry](https://registry.modelcontextprotocol.io) entry |
| `mcp/server.mjs` | Optional stdio bridge for clients that cannot connect to a remote server |

## Stdio bridge

Most clients should connect to the hosted endpoint directly. If yours only supports local stdio servers, `mcp/server.mjs` forwards JSON-RPC requests to the endpoint. It needs Node.js 18 or later and has no dependencies.

Pass your token through the environment so it stays out of your shell history and process list:

```bash
JOBZERO_TOKEN=<YOUR_JOBZERO_API_TOKEN> node mcp/server.mjs
```

## Support

- Setup help: <https://www.jobzero.app/contact>
- Security reports: <contact@jobzero.app>. Please don't open a public issue for a security problem.

## License

[MIT](LICENSE)
