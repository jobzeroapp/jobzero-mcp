#!/usr/bin/env node

/**
 * mcp/server.mjs
 *
 * Standalone stdio CLI bridge for JobZero MCP Server.
 * Enables coding agents (Claude Code, Cursor, Antigravity, Muse, Instinct)
 * to interact with JobZero via stdio JSON-RPC 2.0.
 *
 * Reads JSON-RPC requests from process.stdin, forwards them over HTTP to the
 * JobZero API endpoint with candidate Bearer API token authentication,
 * and streams responses back to process.stdout.
 */

import readline from 'readline';
import { fileURLToPath } from 'url';

function getCliArg(flags) {
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    for (const flag of flags) {
      if (arg === flag && process.argv[i + 1] && !process.argv[i + 1].startsWith('-')) {
        return process.argv[i + 1].trim();
      }
      if (arg.startsWith(flag + '=')) {
        return arg.substring(flag.length + 1).trim();
      }
    }
  }
  return '';
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`JobZero MCP Server (stdio bridge)

Usage:
  node mcp/server.mjs [--token <session_token>] [--url <api_url>]

Options:
  -t, --token    JobZero API token from the Agents tab (or set JOBZERO_TOKEN env var)
  -u, --url      JobZero API URL (default: https://api.jobzero.app/api/mcp)
  -h, --help     Show this help message
`);
  process.exit(0);
}

const tokenFromArg = getCliArg(['--token', '-t']);
const urlFromArg = getCliArg(['--url', '--api-url', '-u']);

const rawToken = tokenFromArg || process.env.JOBZERO_TOKEN || '';
const JOBZERO_TOKEN = rawToken.trim().replace(/^['"]|['"]$/g, '');

const rawUrl = urlFromArg || process.env.JOBZERO_API_URL || '';
const cleanUrl = rawUrl.trim().replace(/^['"]|['"]$/g, '');
const JOBZERO_API_URL = cleanUrl || (
  process.env.JOBZERO_LOCAL === '1'
    ? 'http://localhost:3000/api/mcp'
    : 'https://api.jobzero.app/api/mcp'
);

if (!JOBZERO_TOKEN && process.env.NODE_ENV !== 'test') {
  console.error('[jobzero-mcp] Warning: JOBZERO_TOKEN environment variable is not set.');
  console.error('[jobzero-mcp] Generate an API token at https://www.jobzero.app/agents');
}

const isDirectRun = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]);

export async function handleLine(line, customFetch = fetch) {
  const trimmed = line.trim();
  if (!trimmed) return;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const parseError = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: `Parse error: ${err.message}`
      }
    };
    process.stdout.write(JSON.stringify(parseError) + '\n');
    return;
  }

  // Forward to HTTP MCP endpoint
  try {
    const res = await customFetch(JOBZERO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JOBZERO_TOKEN}`
      },
      body: JSON.stringify(parsed)
    });

    if (res.status === 204) {
      // Notification acknowledgment
      return;
    }

    const data = await res.json();
    process.stdout.write(JSON.stringify(data) + '\n');
  } catch (err) {
    const netError = {
      jsonrpc: '2.0',
      id: parsed?.id ?? null,
      error: {
        code: -32603,
        message: `JobZero MCP Gateway Error: ${err.message}`
      }
    };
    process.stdout.write(JSON.stringify(netError) + '\n');
  }
}

if (isDirectRun) {
  let inFlight = 0;
  let isStdinClosed = false;

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  process.stdin.on('error', (err) => {
    console.error('[jobzero-mcp] Stdin error:', err.message);
  });

  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') process.exit(0);
  });

  rl.on('line', (line) => {
    inFlight++;
    handleLine(line)
      .catch((err) => {
        console.error('[jobzero-mcp] Uncaught bridge error:', err);
      })
      .finally(() => {
        inFlight--;
        if (isStdinClosed && inFlight === 0) {
          process.exit(0);
        }
      });
  });

  rl.on('close', () => {
    isStdinClosed = true;
    if (inFlight === 0) {
      process.exit(0);
    }
  });
}
