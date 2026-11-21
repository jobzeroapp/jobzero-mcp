import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const bridge = fileURLToPath(new URL('./server.mjs', import.meta.url));
const timeout = { timeout: 5000 };

const gateway = function () {
  const timeout = AbortSignal.timeout;
  AbortSignal.timeout = (ms) => {
    if (ms !== 300_000) throw new Error('Unexpected deadline');
    return timeout(20);
  };
  globalThis.fetch = async (url, options) => {
    const { id, method, params } = JSON.parse(options.body);
    if (options.redirect !== 'error' || options.method !== 'POST' ||
        !(options.signal instanceof AbortSignal) ||
        options.headers.Authorization !== 'Bearer fixture-only') {
      throw new Error('Missing expected fetch protections');
    }
    if (method === 'timeout') {
      return new Promise((resolve, reject) => {
        const keepAlive = setTimeout(() => reject(new Error('Missing abort')), 1000);
        options.signal.addEventListener('abort', () => {
          clearTimeout(keepAlive);
          reject(new Error('private gateway detail'));
        }, { once: true });
      });
    }
    if (method === 'notify') return { status: 204 };
    if (method === 'unauthorized') {
      return { status: 401, json: async () => ({
        jsonrpc: '2.0', id, error: { code: -32001, message: 'Unauthorized' }
      }) };
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { status: 200, json: async () => ({ jsonrpc: '2.0', id, result: params ?? url }) };
  };
};

function runBridge(input, { url, args = [], envToken = 'fixture-only' } = {}) {
  const preload = 'data:text/javascript,' + encodeURIComponent('(' + gateway + ')()');
  const env = { NODE_ENV: 'test' };
  if (envToken) env.JOBZERO_TOKEN = envToken;
  if (url) env.JOBZERO_API_URL = url;
  const child = spawn(process.execPath, ['--import', preload, bridge, ...args], { env });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (data) => { stdout += data; });
  child.stderr.setEncoding('utf8').on('data', (data) => { stderr += data; });
  child.stdin.end(input);
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.on('close', (code) => {
      try {
        assert.equal(code, 0);
        assert.equal(stderr, '');
        resolve(stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function request(id, method = 'ping', params) {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params });
}

test('allows HTTPS and loopback HTTP and accepts the environment token', timeout, async () => {
  const urls = ['https://example.com/api/mcp', 'http://localhost:3000/api/mcp',
    'http://127.0.0.1:3000/api/mcp', 'http://[::1]:3000/api/mcp'];
  await Promise.all(urls.map(async (url) => {
    const [response] = await runBridge(request(1), { url });
    assert.equal(response.result, url);
  }));

  const [legacy] = await runBridge(request(1), { envToken: 'ignored', args: ['--token', 'fixture-only'] });
  assert.equal(legacy.result, 'https://api.jobzero.app/api/mcp');
});

test('rejects unsafe URLs without forwarding or echoing the configured URL', timeout, async () => {
  const urls = ['http://example.com/mcp', 'https://private-marker@example.com/mcp',
    'https://example.com/mcp?private-marker', 'https://example.com/mcp#private-marker',
    'https://example.com/mcp?', 'https://example.com/mcp#', 'not a valid URL'];
  await Promise.all(urls.map(async (url) => {
    const [response] = await runBridge(request(1), { url });
    assert.equal(response.id, 1);
    assert.equal(response.error.code, -32603);
    assert.match(response.error.message, /Use an HTTPS gateway/);
    assert.doesNotMatch(response.error.message, /private-marker/);
  }));
});

test('keeps upstream JSON-RPC errors and suppresses notifications and local error details', timeout, async () => {
  const input = [request(undefined, 'notify'), request(2, 'unauthorized'),
    request(3, 'timeout'), request(undefined, 'timeout'), '{ private-marker'].join('\r\n');
  const responses = await runBridge(input);
  assert.equal(responses.length, 3);
  assert.equal(responses.find(({ id }) => id === 2).error.message, 'Unauthorized');
  assert.equal(responses.find(({ id }) => id === 3).error.message, 'JobZero MCP Gateway Error');
  assert.equal(responses.find(({ id }) => id === null).error.message, 'Parse error');
});

test('limits concurrency and retains the ID when declining a request', timeout, async () => {
  const calls = Array.from({ length: 9 }, (_, id) => request(id));
  calls.push(request(undefined, 'notify'));
  const responses = await runBridge(calls.join('\n'));
  assert.equal(responses.length, 9);
  assert.equal(responses.find(({ id }) => id === 8).error.code, -32003);
  assert.equal(responses.filter(({ result }) => result).length, 8);
});

test('discards an oversized line and drains the final valid request on EOF', timeout, async () => {
  const input = request(1, 'ping', 'é'.repeat(1024 * 1024)) + '\r\n' + request(2, 'ping', '🚀');
  const responses = await runBridge(input);
  assert.equal(responses.length, 2);
  assert.equal(responses[0].id, null);
  assert.equal(responses[0].error.code, -32003);
  assert.deepEqual(responses[1], { jsonrpc: '2.0', id: 2, result: '🚀' });
});
