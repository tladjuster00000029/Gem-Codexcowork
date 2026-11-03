import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode32, decode32, hotp, verify, validateSnapshot } from './totp.mjs';
const secret = encode32(Buffer.from('12345678901234567890'));
test('RFC 4226 HOTP vectors and base32 round trip', () => {
  assert.equal(decode32(secret).toString(), '12345678901234567890');
  const values = ['755224','287082','359152','969429','338314','254676','287922','162583','399871','520489'];
  values.forEach((value, i) => assert.equal(hotp(secret, i), value));
});
test('RFC 6238 SHA1 vectors', () => {
  for (const [seconds, expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']]) assert.equal(hotp(secret, Math.floor(seconds / 30), 8), expected);
});
test('rejects replay, old/future codes and invalid input', () => {
  const now = 1234567890000, counter = Math.floor(now / 30000);
  assert.equal(verify(secret, hotp(secret, counter), -1, now), counter);
  assert.equal(verify(secret, hotp(secret, counter - 1), -1, now), counter - 1);
  for (const code of [hotp(secret, counter - 2), hotp(secret, counter + 1), '', '123', 'abcdef']) assert.equal(verify(secret, code, -1, now), null);
  assert.equal(verify(secret, hotp(secret, counter), counter, now), null);
});
test('approval binds open non-draft PR, repository, head, base and expiry', () => {
  const repository = 'owner/repo';
  const pr = { state: 'open', merged: false, draft: false, head: { sha: 'a', repo: { full_name: repository } }, base: { ref: 'main', sha: 'b', repo: { full_name: repository } } };
  const snapshot = { sha: 'a', base: 'main', baseSha: 'b', created: Date.now() };
  assert.doesNotThrow(() => validateSnapshot(pr, snapshot, repository));
  for (const altered of [{ ...pr, state: 'closed' }, { ...pr, draft: true }, { ...pr, merged: true }, { ...pr, head: { ...pr.head, sha: 'new' } }, { ...pr, base: { ...pr.base, sha: 'new' } }]) assert.throws(() => validateSnapshot(altered, snapshot, repository));
  assert.throws(() => validateSnapshot(pr, { ...snapshot, created: Date.now() - 300001 }, repository));
  assert.throws(() => validateSnapshot(pr, snapshot, 'other/repo'));
});
