#!/usr/bin/env node

/**
 * mcp/server.mjs
 *
 * Standalone stdio CLI bridge for JobZero MCP Server.
 * Enables clients with local MCP support to interact with JobZero
 * via stdio JSON-RPC 2.0.
 *
 * Reads JSON-RPC requests from process.stdin, forwards them over HTTP to the
 * JobZero API endpoint with candidate Bearer API token authentication,
 * and streams responses back to process.stdout.
 */

import { once } from 'node:events';
import { fileURLToPath } from 'url';

const MAX_IN_FLIGHT = 8;
const MAX_LINE_BYTES = 2 * 1024 * 1024;
const GATEWAY_TIMEOUT_MS = 300_000;
const CAPACITY_ERROR = -32003;

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
  node mcp/server.mjs [--url <api_url>]  (set JOBZERO_TOKEN in the environment)

Options:
  -t, --token    Legacy option; use JOBZERO_TOKEN to keep tokens out of process arguments
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

export function validateGatewayUrl(value) {
  const url = URL.canParse(value) ? new URL(value) : null;
  const loopback = url && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!url || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.href.includes('?') || url.href.includes('#')) {
    throw new Error('Use an HTTPS gateway URL without credentials, a query, or a fragment. HTTP is allowed for loopback development.');
  }
  return url;
}

function writeMessage(message) {
  return process.stdout.write(JSON.stringify(message) + '\n');
}

function writeError(id, code, message) {
  return writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

export async function handleLine(line, customFetch = fetch, atCapacity = false) {
  const trimmed = line.trim();
  if (!trimmed) return;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    writeError(null, -32700, 'Parse error');
    return;
  }

  const id = parsed?.id ?? null;
  const notification = parsed?.jsonrpc === '2.0' && typeof parsed.method === 'string' &&
    !Object.hasOwn(parsed, 'id');
  if (atCapacity) {
    if (!notification) writeError(id, CAPACITY_ERROR, 'Bridge capacity exceeded. Retry after pending calls finish.');
    return;
  }

  let url;
  try {
    url = validateGatewayUrl(JOBZERO_API_URL);
  } catch (err) {
    if (!notification) writeError(id, -32603, err.message);
    return;
  }

  try {
    const res = await customFetch(url.href, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JOBZERO_TOKEN}`
      },
      body: JSON.stringify(parsed)
    });

    if (res.status === 204) return;
    if (notification) {
      await res.body?.cancel();
      return;
    }
    writeMessage(await res.json());
  } catch {
    if (!notification) writeError(id, -32603, 'JobZero MCP Gateway Error');
  }
}

async function runBridge() {
  // Keep one bounded byte buffer. Discard the rest of an oversized line through
  // its delimiter so the next request can still be read.
  const line = Buffer.alloc(MAX_LINE_BYTES);
  let length = 0;
  let oversized = false;
  let inFlight = 0;

  function finishLine() {
    if (oversized) {
      writeError(null, CAPACITY_ERROR, 'Bridge input exceeds the 2 MiB line limit.');
    } else if (length) {
      const request = line.toString('utf8', 0, length);
      if (inFlight >= MAX_IN_FLIGHT) {
        void handleLine(request, fetch, true);
      } else {
        inFlight++;
        void handleLine(request).finally(() => { inFlight--; });
      }
    }
    length = 0;
    oversized = false;
  }

  for await (const chunk of process.stdin) {
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(10, start);
      const end = newline === -1 ? chunk.length : newline;
      if (!oversized) {
        if (length + end - start > MAX_LINE_BYTES) {
          oversized = true;
        } else {
          chunk.copy(line, length, start, end);
          length += end - start;
        }
      }
      if (newline !== -1) {
        finishLine();
        if (process.stdout.writableNeedDrain) await once(process.stdout, 'drain');
      }
      start = end + 1;
    }
  }
  finishLine();
}

if (isDirectRun) {
  process.stdout.on('error', (err) => {
    if (err.code === 'EPIPE') process.exit(0);
  });

  await runBridge().catch(() => {
    console.error('[jobzero-mcp] Could not read stdin.');
    process.exitCode = 1;
  });
}
