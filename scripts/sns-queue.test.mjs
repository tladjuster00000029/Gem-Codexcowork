import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enqueue, runQueue, listJobs, isNight, estimate, retryJob } from './sns-queue.mjs';
import { validatePost } from './sns-validator.mjs';
import { subscriptionEnv } from './subscription-cli.mjs';

const template = JSON.parse(readFileSync(new URL('../playbooks/sns-writing/files/output-schema.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
function fixture() {
  const bundle = structuredClone(template);
  bundle.post.instagram.caption = '안내 ' + Array.from({ length: 11 }, (_, i) => `#태그${i}`).join(' ');
  bundle.post.threads.reply_text = '안내 #가 #나 #다 #라 #마';
  return bundle;
}
function setup(t, text = '가상 입력 원고') {
  const folder = mkdtempSync(join(tmpdir(), 'sns-queue-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const source = join(folder, 'source.txt');
  writeFileSync(source, text);
  return { store: join(folder, 'queue'), source };
}
test('night scheduling uses Seoul time and urgency overrides size', () => {
  assert.equal(isNight(new Date('2026-11-04T18:00:00Z')), true);
  assert.equal(isNight(new Date('2026-11-04T21:00:00Z')), false);
  assert.equal(estimate('가'.repeat(7000)).lane, 'night');
  assert.equal(estimate('가'.repeat(7000), true).lane, 'now');
});
test('rejects renderer-incompatible shapes and unresolved publication links', () => {
  const post = fixture().post;
  assert.deepEqual(validatePost(post), []);
  assert.match(validatePost(post, { publish: true }).join(), /글 번호/);
  post.cards.slides_2_to_4[0].note = ['배열'];
  post.theme_color = 'green_forest';
  assert.equal(validatePost(post).length, 2);
});
test('API auth and custom endpoints are removed', () => {
  assert.deepEqual(subscriptionEnv({ PATH: 'ok', GEMINI_API_KEY: 'secret', OPENAI_API_KEY: 'secret', GOOGLE_GENAI_USE_VERTEXAI: 'true', OPENAI_BASE_URL: 'bad' }), { PATH: 'ok' });
});
test('completes three stages, preserves outputs locally and never auto-publishes', t => {
  const { store, source } = setup(t);
  const job = enqueue(store, source);
  const stages = [];
  runQueue(store, { call: stage => {
    stages.push(stage);
    if (stage === 'plan') return '계획';
    if (stage === 'draft') return JSON.stringify(fixture());
    return JSON.stringify({ approved: true, findings: [], evidence: '가상 검토' });
  } });
  assert.deepEqual(stages, ['plan', 'draft', 'review']);
  assert.equal(listJobs(store)[0].status, 'awaiting_user_approval');
  assert.equal(JSON.parse(readFileSync(join(store, job.id, 'current_post.json'))).theme_color, 'burgundy');
  runQueue(store, { call: () => { throw new Error('Completed job ran twice'); } });
  assert.equal(listJobs(store)[0].attempts, 1);
});
test('quota pause resumes from completed planning stage', t => {
  const { store, source } = setup(t);
  const job = enqueue(store, source);
  runQueue(store, { call: stage => { if (stage === 'plan') return '계획'; throw new Error('구독 한도'); } });
  assert.equal(listJobs(store)[0].status, 'paused');
  retryJob(store, job.id);
  const stages = [];
  runQueue(store, { call: stage => {
    stages.push(stage);
    return stage === 'draft' ? JSON.stringify(fixture()) : JSON.stringify({ approved: true, findings: [], evidence: '확인' });
  } });
  assert.deepEqual(stages, ['draft', 'review']);
});
test('three failed checks stop before reviewer and night job waits', t => {
  const { store, source } = setup(t, '가'.repeat(7000));
  enqueue(store, source);
  runQueue(store, { now: new Date('2026-11-05T04:00:00Z'), call: () => { throw new Error('Daytime heavy job ran'); } });
  assert.equal(listJobs(store)[0].status, 'queued');
  runQueue(store, { now: new Date('2026-11-04T18:00:00Z'), call: stage => {
    if (stage === 'plan') return '계획';
    assert.equal(stage, 'draft');
    return JSON.stringify({ post: {} });
  } });
  assert.equal(listJobs(store)[0].status, 'needs_revision');
});
