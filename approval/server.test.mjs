import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hotp } from './totp.mjs';

test('local approval server enforces origin, session, CSRF and enrollment confirmation', { timeout: 20000 }, async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'approval-server-test-'));
  const app = join(fixture, 'approval'); mkdirSync(app);
  for (const name of ['server.mjs', 'totp.mjs', 'index.html', 'app.js']) copyFileSync(new URL(name, import.meta.url), join(app, name));
  const child = spawn(process.execPath, [join(app, 'server.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
    });
    assert.equal((await fetch(`${origin}/state`)).status, 403);
    const page = await fetch(origin);
    assert.match(await page.text(), /OTP/);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const cookie = page.headers.get('set-cookie').split(';')[0];
    const state = await (await fetch(`${origin}/state`, { headers: { Cookie: cookie } })).json();
    assert.equal(state.enrolled, false);
    const post = (path, data, extra = {}) => fetch(`${origin}${path}`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'X-CSRF-Token': state.csrf, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(data) });
    assert.equal((await post('/enroll', {}, { Origin: 'https://attacker.invalid' })).status, 403);
    assert.equal((await post('/enroll', {}, { 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.equal((await post('/approve', { otp: '000000' })).status, 400);
    const enrollment = await (await post('/enroll', {})).json();
    assert.match(enrollment.secret, /^[A-Z2-7]{32}$/);
    const otp = hotp(enrollment.secret, Math.floor(Date.now() / 30000));
    assert.equal((await post('/confirm-enrollment', { otp })).status, 200);
    assert.equal((await post('/enroll', {})).status, 400);
    const stored = JSON.parse(readFileSync(join(fixture, '.approval-local', 'state.json'), 'utf8'));
    assert.equal(stored.secret, enrollment.secret);
    assert.ok(stored.lastCounter > 0);
    assert.equal(stored.token, undefined);
  } finally {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    rmSync(fixture, { recursive: true, force: true });
  }
});
