import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReview } from './cowork.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

test('accepts a clean approval or actionable rejection', () => {
  assert.equal(validateReview({ approved: true, summary: 'OK', findings: [] }).approved, true);
  assert.equal(validateReview({ approved: false, summary: 'Fix', findings: ['Missing validation'] }).approved, false);
});

test('plan and review preserve new-file changes and write approval output', () => {
  const root = mkdtempSync(join(tmpdir(), 'cowork-test-'));
  const repo = join(root, 'repo');
  const temp = join(root, 'temp');
  mkdirSync(repo); mkdirSync(temp);
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  try {
    git('init');
    writeFileSync(join(repo, 'README.md'), 'Fixture project');
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
    const script = pathToFileURL(fileURLToPath(new URL('./cowork.mjs', import.meta.url))).href;
    const run = (stage, result) => {
      const source = `globalThis.fetch = async () => ({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:${JSON.stringify(result)}}]}}]})}); process.argv[1] = ${JSON.stringify(fileURLToPath(new URL('./cowork.mjs', import.meta.url)))}; process.argv[2] = ${JSON.stringify(stage)}; await import(${JSON.stringify(script)});`;
      execFileSync(process.execPath, ['--input-type=module', '-e', source], { cwd: repo, encoding: 'utf8',
        env: { ...process.env, RUNNER_TEMP: temp, TASK: 'Add a greeting', GEMINI_MODEL: 'fixture-model',
          GEMINI_API_KEY: 'mock-key', ROUND: '1', GITHUB_OUTPUT: join(temp, 'output') } });
    };
    run('plan', 'Add greeting.txt and verify contents.');
    assert.match(readFileSync(join(temp, 'cowork-prompt.md'), 'utf8'), /Add a greeting/);
    writeFileSync(join(repo, 'greeting.txt'), 'hello\n');
    writeFileSync(join(temp, 'codex-result.md'), 'Verified greeting.txt contents.');
    run('review', JSON.stringify({ approved: true, summary: 'OK', findings: [] }));
    assert.match(readFileSync(join(temp, 'output'), 'utf8'), /approved=true/);
    assert.match(readFileSync(join(temp, 'cowork.patch'), 'utf8'), /greeting.txt/);
    assert.match(readFileSync(join(temp, 'pr-body.md'), 'utf8'), /human review required/);
    writeFileSync(join(repo, 'AGENTS.md'), 'unauthorized change');
    assert.throws(() => run('review', JSON.stringify({ approved: true, summary: 'OK', findings: [] })));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('rejects contradictory or malformed reviews', () => {
  for (const value of [null, {}, { approved: 'true', summary: '', findings: [] },
    { approved: true, summary: '', findings: ['Bug'] }, { approved: false, summary: '', findings: [1] }]) {
    assert.throws(() => validateReview(value));
  }
});
