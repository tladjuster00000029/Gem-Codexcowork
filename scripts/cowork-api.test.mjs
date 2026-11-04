import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestJson, redact } from './cowork-api.mjs';

function harness(statuses, options = {}) {
  const calls = [], delays = [], events = [], logs = [];
  const key = 'AIza-test-private-key';
  const request = () => requestJson({ provider: 'Gemini', model: 'fixture', key,
    url: 'https://example.invalid', headers: { 'x-goog-api-key': key }, body: {},
    random: () => 0, sleep: async ms => delays.push(ms), log: line => logs.push(line), diagnostic: event => events.push(event),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
      if (status instanceof Error) throw status;
      return { ok: status === 200, status, headers: new Headers(options.headers),
        json: async () => status === 200 ? { connected: true } : { error: {
          status: options.code || 'UNAVAILABLE', message: `Private ${key} sk-fixtureSECRET\nquota unavailable` } } };
    }
  });
  return { request, calls, delays, events, logs };
}

test('503 is retried with exponential backoff and then succeeds', async () => {
  const h = harness([503, 503, 200]);
  assert.deepEqual(await h.request(), { connected: true });
  assert.deepEqual(h.delays, [1000, 2000]);
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[0].init.redirect, 'error');
  assert.equal(h.events[0].httpStatus, 503);
});

test('persistent 503 stops after five attempts, retaining sanitized diagnostics', async () => {
  const h = harness([503]);
  await assert.rejects(h.request(), error => {
    assert.match(error.message, /attempt 5\/5/);
    assert.doesNotMatch(error.message, /AIza-test-private-key|sk-fixtureSECRET|\n/);
    return true;
  });
  assert.deepEqual(h.delays, [1000, 2000, 4000, 8000]);
  assert.equal(h.calls.length, 5);
  assert.equal(h.events.at(-1).retry, false);
  assert.doesNotMatch(JSON.stringify(h.events), /AIza-test-private-key|sk-fixtureSECRET/);
});

test('client errors fail immediately instead of wasting retries', async () => {
  for (const status of [400, 401, 402, 403, 404]) {
    const h = harness([status]);
    await assert.rejects(h.request(), new RegExp(`HTTP ${status}`));
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.delays, []);
  }
});

test('429 respects Retry-After and transport errors retry', async () => {
  const limited = harness([429, 200], { headers: { 'retry-after': '3' }, code: 'RESOURCE_EXHAUSTED' });
  await limited.request();
  assert.deepEqual(limited.delays, [3000]);
  for (const error of [new TypeError('socket failed'), new DOMException('timeout', 'TimeoutError')]) {
    const h = harness([error, 200]);
    await h.request();
    assert.deepEqual(h.delays, [1000]);
    assert.equal(h.events[0].httpStatus, 'NETWORK');
  }
});

test('redaction removes exact secrets, key patterns and log control characters', () => {
  assert.equal(redact('secret123\nBearer token123 AIzaExample sk-example', ['secret123']),
    '[REDACTED] Bearer [REDACTED] [REDACTED] [REDACTED]');
});
