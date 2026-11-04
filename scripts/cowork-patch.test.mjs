import { test } from 'node:test';
import assert from 'node:assert/strict';
import { protectedPath, validatePatch, validatePayload } from './cowork-patch.mjs';

test('protects new control scripts, nested agent settings and Git attributes', () => {
  for (const path of ['.github/workflows/round.yml', 'scripts/cowork-api.mjs', 'scripts/cowork-probe.mjs',
    'approval/server.mjs', 'package-lock.json', '.gitattributes', '.env', 'src/.env.local',
    'src/AGENTS.md', '.codex/config.toml', '.agents/hooks.json', '.approval-local/state.json']) {
    assert.equal(protectedPath(path), true, path);
  }
  assert.equal(protectedPath('src/app.mjs'), false);
  assert.equal(protectedPath('README.md'), false);
});

test('rejects symlink and submodule patches before any apply', () => {
  for (const mode of ['120000', '160000']) {
    assert.throws(() => validatePatch(`diff --git a/link b/link\nnew file mode ${mode}\n`), /manual review/);
    assert.throws(() => validatePatch(`diff --git a/link b/link\nindex 123..456 ${mode}\n`), /manual review/);
  }
});

test('rejects malformed, oversized and non-applicable payloads', () => {
  assert.throws(() => validatePayload({ patch: '', report: 1 }), /Invalid Codex report/);
  assert.throws(() => validatePayload({ patch: 'x'.repeat(16001), report: '' }), /review budget/);
  assert.throws(() => validatePayload({ patch: '', report: 'x'.repeat(2001) }), /Invalid Codex report/);
  assert.throws(() => validatePatch('not a patch'));
  assert.deepEqual(validatePayload({ patch: '', report: 'No changes' }), { patch: '', report: 'No changes' });
});
