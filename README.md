# JobZero MCP

Use [JobZero](https://www.jobzero.app) from your coding agent or another MCP client. Check job postings, search your tracked jobs, score your fit, tailor resumes, and prepare application answers.

This repository contains the setup guide, agent skill, registry metadata, and an optional stdio bridge for JobZero's hosted MCP server.

| Connection | Value |
| --- | --- |
| Endpoint | `https://api.jobzero.app/api/mcp` |
| Transport | Streamable HTTP |
| Authentication | JobZero API token sent as a Bearer token |
| Setup page | [jobzero.app/mcp](https://www.jobzero.app/mcp) |
| Official registry name | `app.jobzero/jobzero` |

## Set up your account

1. Sign in to [JobZero](https://www.jobzero.app/mcp).
2. Open [Agents](https://www.jobzero.app/agents) and generate an API token. It is shown once and can be regenerated or revoked there.
3. Put the token in your client's credential settings or an environment variable available to the client. Keep it out of chat messages and committed files.
4. Connect using one of the options below, then start a new agent session or reconnect the server.

The hosted server was checked on November 7, 2026 and advertises eight tools. Scanning, profile setup from an agent, resumable tasks, and application tracking are being added. The rollout section below explains how to handle availability. While profile setup through MCP is unavailable, complete your profile in the web app before requesting scores or tailored resumes. If Agents redirects you to profile setup, complete setup there and return to Agents.

## Connect your client

### Codex

Add the following to `~/.codex/config.toml`. Set `JOBZERO_TOKEN` in the environment of the Codex host before launching or restarting it.

```toml
[mcp_servers.jobzero]
url = "https://api.jobzero.app/api/mcp"
bearer_token_env_var = "JOBZERO_TOKEN"
```

Use `codex mcp list` to check the configuration. See the [official MCP setup documentation](https://developers.openai.com/codex/mcp).

### Claude Code

Add this entry to your project's `.mcp.json`. Set `JOBZERO_TOKEN` in your environment before starting Claude Code. Review the project configuration when Claude Code asks for approval.

```json
{
  "mcpServers": {
    "jobzero": {
      "type": "http",
      "url": "https://api.jobzero.app/api/mcp",
      "headers": {
        "Authorization": "Bearer ${JOBZERO_TOKEN}"
      }
    }
  }
}
```

Use `/mcp` to check the connection. See [Claude Code's MCP documentation](https://code.claude.com/docs/en/mcp).

### Cursor and clients with remote HTTP support

In Cursor, add this entry to `.cursor/mcp.json`. For other clients, enter the URL and Authorization header in their MCP settings according to their documentation. The credential value below is a placeholder. Keep any configuration containing your real token out of version control.

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

For a client with a secure credential prompt, enter the token there. For a client that supports only local stdio servers, use the bridge below.

## Teach the agent the workflow

The [JobZero skill](skills/jobzero/SKILL.md) explains tool selection, resume review, and feature rollout. Give your agent that file or install it using the client's skill installation mechanism.

For Claude Code, copy `skills/jobzero/SKILL.md` from this repository into `~/.claude/skills/jobzero/SKILL.md`. The website also publishes a skill at [jobzero.app/skill.md](https://www.jobzero.app/skill.md); its rollout can differ from this repository.

Try these requests after connecting.

- "Find my strongest job matches using JobZero."
- "Check this posting and score my fit: <job URL>"
- "Show my best matches at Stripe from this week."
- "Tailor my resume for this role and show me every proposed change."
- "Get my answers for this application's form."

The client discovers the server's tool list when it connects. Installing a skill alone does not connect the MCP server. Official registry publication and inclusion in GitHub's curated MCP catalog are separate processes.

## Available tools

These tools were advertised by the hosted server on November 7, 2026. The server's `tools/list` response is the source of truth.

| Tool | Purpose |
| --- | --- |
| `jobzero_get_profile_and_quota` | Read your profile summary and remaining plan limits |
| `jobzero_verify_and_add_job` | Check a posting URL and add it to your tracked jobs |
| `jobzero_add_jobs` | Add up to ten postings per call and optionally score them |
| `jobzero_search_jobs` | Search your own tracked jobs by company, location, fit, and other filters |
| `jobzero_score_jobs` | Score fit against your profile on a 1.0–5.0 scale |
| `jobzero_tailor_resume` | Generate a saved draft with proposed changes and verification flags |
| `jobzero_approve_resume` | Approve reviewed changes and compile a PDF, with an application action based on your plan |
| `jobzero_get_prefill_payload` | Retrieve application fields, answers, and resume links permitted by your plan |

## Feature rollout

The following tools are being added to the hosted service. Use them only when they appear in `tools/list`.

| Tool | Purpose after rollout |
| --- | --- |
| `jobzero_list_company_boards` | Find supported company boards |
| `jobzero_setup_profile` | Preview and save reviewed resume Markdown and preferences |
| `jobzero_scan_jobs` | Scan selected or saved companies and return a task ID |
| `jobzero_get_task` | Poll a task's status and retrieve its result |
| `jobzero_list_applications` | Read application status and approved resume links |
| `jobzero_record_manual_submission` | Record a submission the candidate confirms they already made |

After rollout, `jobzero_get_profile_and_quota` also reports setup readiness. Scoring and tailoring accept an optional `requestId` to start a resumable run. Task results remain accessible for one hour after completion within the same server process. A restart clears these records, and multiple server processes do not share them. Use the same request ID and inputs to retry within that window.

## Review and plan limits

Your agent should show proposed resume changes and verification flags and get your approval before calling `jobzero_approve_resume`. For Free and Pro, approval returns an external application link. For Max, approval may queue JobZero AI Apply; the agent should explain this before asking you to approve. Recording a manual submission only updates tracking for a submission you already made.

JobZero plan limits and feature access apply to calls made through MCP. Your coding agent provider may charge separately for the agent session. See [JobZero pricing](https://www.jobzero.app/pricing).

## Optional stdio bridge

The bridge needs Node.js 20 or later and has no package dependencies. It forwards JSON-RPC requests to the hosted endpoint. Set `JOBZERO_TOKEN` in the launching client's environment or credential manager, then run this from the repository root.

```bash
node mcp/server.mjs
```

Use an absolute path when configuring a client that starts the bridge from another directory. Run `node mcp/server.mjs --help` for options. Local bridge startup can be checked without credentials using that help command.

## Troubleshooting

- If a token is rejected, regenerate it on Agents and update the client's credentials.
- If the client cannot connect directly over HTTP, check its supported transports and use the stdio bridge if appropriate.
- If a tool is missing, reconnect or start a new session to refresh discovery. Follow the currently advertised tools and use the web app for features awaiting rollout.
- If a task cannot be found after a restart or after its retry window, check your jobs or resume draft before starting another operation.

## Repository contents

| Path | Purpose |
| --- | --- |
| `skills/jobzero/SKILL.md` | Agent workflow and tool guidance |
| `mcp/server.json` | Metadata for the official MCP Registry |
| `mcp/server.mjs` | Optional local stdio bridge |

The registry currently publishes version `1.0.0`. Changes to this repository do not automatically publish a new registry version.

## Support and license

For setup help, use [JobZero contact](https://www.jobzero.app/contact). Send security reports to [contact@jobzero.app](mailto:contact@jobzero.app).

The files in this repository are available under the [MIT license](LICENSE).
