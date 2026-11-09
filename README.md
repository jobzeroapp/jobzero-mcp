# JobZero MCP

Use [JobZero](https://www.jobzero.app) from your AI assistant. Connect once, then find and check jobs, score your fit, tailor your resume, prepare application answers, and track your applications from a chat.

This repo holds the public setup for JobZero's hosted MCP (Model Context Protocol) server: the agent skill, the MCP Registry entry, and an optional stdio bridge. JobZero hosts the server, so there is nothing to deploy.

| Connection | Value |
| --- | --- |
| Endpoint | `https://api.jobzero.app/api/mcp` |
| Transport | Streamable HTTP |
| Authentication | JobZero API token, sent as a Bearer token |
| Setup page | [jobzero.app/mcp](https://www.jobzero.app/mcp) |
| Registry name | `app.jobzero/jobzero` |

## 1. Create an API token

New to JobZero? Start at [jobzero.app/mcp](https://www.jobzero.app/mcp) to sign up or sign in, then generate a token on [Agents](https://www.jobzero.app/agents). If you are already signed in, go straight to Agents. The token is shown once, works only with the JobZero MCP server, and can be regenerated or revoked there at any time.

Keep the token in your assistant's credential settings or an environment variable. Never paste it into a chat message or commit it to a file.

## 2. Connect your assistant

### Muse, Instinct, and other chat assistants

Paste this into a chat. When the assistant asks for your token, enter it in its secure credentials prompt, not in the chat.

```text
Connect to the JobZero MCP server at https://api.jobzero.app/api/mcp. It needs my JobZero API token as a Bearer token in the Authorization header. Ask for the token through your secure credentials prompt, not in this chat. Then read https://www.jobzero.app/skill.md for how to use it.
```

### Claude Code

Run this once. It connects JobZero and installs the skill.

```bash
claude mcp add --transport http jobzero https://api.jobzero.app/api/mcp -H "Authorization: Bearer <YOUR_JOBZERO_API_TOKEN>" && mkdir -p ~/.claude/skills/jobzero && curl -fsSL https://www.jobzero.app/skill.md -o ~/.claude/skills/jobzero/SKILL.md
```

Use `/mcp` in Claude Code to check the connection.

### Codex

Add this to `~/.codex/config.toml`, then set `JOBZERO_TOKEN` in the environment Codex starts from.

```toml
[mcp_servers.jobzero]
url = "https://api.jobzero.app/api/mcp"
bearer_token_env_var = "JOBZERO_TOKEN"
```

Run `codex mcp list` to check it. See the [Codex MCP docs](https://developers.openai.com/codex/mcp).

### Cursor, Claude Desktop, and other MCP clients

Add this to `.cursor/mcp.json`, your Claude Desktop config, or your client's MCP settings. Keep any file that contains your real token out of version control.

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

If your client only supports local stdio servers, use the [stdio bridge](#stdio-bridge).

## 3. Ask your assistant

Start with "What can I do with JobZero?", or try:

- "Set up my JobZero profile from this resume."
- "Scan Stripe and Figma for new roles and score them."
- "Is this job still open? Score my fit: `<job link>`"
- "Show my best matches at Stripe from this week."
- "Tailor my resume for my top match and show me every change."
- "Get my answers for this application form."
- "Which applications have I submitted?"

The [skill](skills/jobzero/SKILL.md) teaches your assistant which tool to use and how to review changes with you. You still need to connect the server: the skill alone does not connect anything.

## Tools

| Tool | What it does |
| --- | --- |
| `jobzero_get_profile_and_quota` | Your profile summary, setup progress, and remaining plan limits |
| `jobzero_setup_profile` | Previews profile, resume, and job preference changes, and saves them once you approve |
| `jobzero_list_company_boards` | Finds supported company job boards |
| `jobzero_scan_jobs` | Scans up to three companies, or your saved targets, for new roles |
| `jobzero_get_task` | Reports the progress and result of a scan, scoring, or tailoring run |
| `jobzero_verify_and_add_job` | Checks that a job link is live and adds it with a JobQuickRead™ |
| `jobzero_add_jobs` | Adds up to 10 job postings per call, optionally scoring them |
| `jobzero_search_jobs` | Searches your tracked jobs by company, location, score, seniority, technology, and recency |
| `jobzero_score_jobs` | Scores your fit from 1.0 to 5.0 with a FitScore™ |
| `jobzero_tailor_resume` | Tailors your resume for a job and returns changes to review |
| `jobzero_approve_resume` | Applies the changes you accepted and returns the resume PDF |
| `jobzero_get_prefill_payload` | Prepares answers for a job's application form |
| `jobzero_list_applications` | Lists your applications, their status, and approved resume links |
| `jobzero_record_manual_submission` | Records an application you already submitted yourself |

Profile setup, scanning, run tracking, and application tracking are rolling out now. If one of those tools is missing from your assistant's tool list, reconnect to refresh it, or use the [web app](https://www.jobzero.app) in the meantime.

Scans, scoring, and tailoring can run in the background: your assistant starts a run with a request ID and checks on it with `jobzero_get_task`. If the connection drops, retrying with the same request ID picks up the same run instead of starting (and paying for) a new one.

## You stay in control

- Your assistant shows you every resume change and verification flag, and waits for your OK before approving.
- Every tool tells your assistant whether it only reads, can overwrite your data, or reaches outside JobZero, so the assistant can run lookups freely and ask before the rest.
- On Free and Pro, approving returns a link for you to apply yourself. On Max, approving can queue JobZero AI Apply, and your assistant should tell you that before you approve.
- Recording a submission only updates your tracker. It never sends anything to an employer, and the skill tells assistants never to submit an application for you.
- Scans, scores, and tailored resumes made from your assistant count toward your JobZero plan, just like in the app. Your assistant's own usage is billed by its provider, not JobZero. See [pricing](https://www.jobzero.app/pricing).

## Stdio bridge

Most clients should connect to the hosted endpoint directly. If yours only supports local stdio servers, `mcp/server.mjs` forwards JSON-RPC requests to the endpoint. It needs Node.js 20 or later and has no dependencies.

Set `JOBZERO_TOKEN` in the environment of the client that launches the bridge, so the token stays out of your shell history and process list, then point the client at:

```bash
node /absolute/path/to/jobzero-mcp/mcp/server.mjs
```

Run `node mcp/server.mjs --help` for options.

## Troubleshooting

- **Token rejected:** regenerate it on [Agents](https://www.jobzero.app/agents) and update your client's credentials.
- **Tool missing:** reconnect the server or start a new session so the client reloads the tool list.
- **A run reports `TASK_INTERRUPTED` or can no longer be found:** check your jobs and resume drafts in JobZero before starting a new run, since the earlier one may have saved its work.

## What's in this repo

| Path | Purpose |
| --- | --- |
| `skills/jobzero/SKILL.md` | Agent skill: when to use each tool and how to review changes with you |
| `mcp/server.json` | [MCP Registry](https://registry.modelcontextprotocol.io) entry |
| `mcp/server.mjs` | Optional stdio bridge for clients that cannot connect to a remote server |

## Support

- Setup help: [jobzero.app/contact](https://www.jobzero.app/contact)
- Security reports: [contact@jobzero.app](mailto:contact@jobzero.app). Please don't open a public issue for a security problem.

## License

[MIT](LICENSE)
