import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateReview } from './cowork.mjs';

test('review must be consistent and correctly typed', () => {
  assert.equal(validateReview({ approved: true, summary: 'OK', findings: [] }).approved, true);
  for (const value of [null, {}, { approved: 'true', summary: '', findings: [] },
    { approved: true, summary: '', findings: ['Bug'] }]) assert.throws(() => validateReview(value));
});
test('legacy API path fails closed even when an API key exists', () => {
  assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL('./cowork.mjs', import.meta.url)), 'plan'], {
    env: { ...process.env, GEMINI_API_KEY: 'mock-key' }, stdio: 'pipe',
  }), error => error.status === 1 && /API-key collaboration is disabled/.test(String(error.stderr)));
});
