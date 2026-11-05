import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateBundle, instagramFooter, enqueue, runQueue, listJobs, isNight, estimate, retryJob } from './sns-queue.mjs';
import { validatePost } from './sns-validator.mjs';
import { subscriptionEnv, parseGoogleResponse, invoke, invokeGoogleSubscription } from './subscription-cli.mjs';

const template = JSON.parse(readFileSync(new URL('../playbooks/sns-writing/files/output-schema.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
function fixture() {
  const bundle = structuredClone(template);
  bundle.post.instagram.caption = instagramFooter + '\n안내 ' + Array.from({ length: 11 }, (_, i) => `#태그${i}`).join(' ');
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
test('Google envelope must reach a successful terminal state', () => {
  assert.equal(parseGoogleResponse('{"status":"SUCCESS","response":"OK"}'), 'OK');
  for (const status of ['ERROR', 'WAITING', 'RUNNING', 'CANCELED']) {
    assert.throws(() => parseGoogleResponse(JSON.stringify({ status, response: 'partial' })));
  }
});
test('CLI sign-in errors are reported without exposing raw diagnostics', () => {
  assert.throws(() => invoke(process.execPath, ['-e', 'console.error("Authentication required. private detail"); process.exit(1)']),
    error => /구독 로그인/.test(error.message) && !error.message.includes('private detail'));
});
test('model calls wait until the login flow has finished', t => {
  const { source } = setup(t);
  assert.throws(() => invokeGoogleSubscription('test', { executable: 'missing', authMarker: source }), /로그인 연결이 진행 중/);
});
test('completes three stages, preserves outputs locally and never auto-publishes', t => {
  const { store, source } = setup(t);
  const job = enqueue(store, source);
  const stages = [];
  runQueue(store, { call: stage => {
    stages.push(stage);
    if (stage === 'plan') return '계획';
    if (stage === 'draft') return JSON.stringify(fixture());
    return JSON.stringify({ approved: true, findings: [], revised_bundle: fixture(), changes: [], evidence: '가상 검토' });
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
    return stage === 'draft' ? JSON.stringify(fixture()) : JSON.stringify({ approved: true, findings: [], revised_bundle: fixture(), changes: [], evidence: '확인' });
  } });
  assert.deepEqual(stages, ['draft', 'review']);
});
test('new jobs can be registered while another job is running', t => {
  const { store, source } = setup(t);
  enqueue(store, source);
  runQueue(store, { call: stage => {
    if (stage === 'plan') { enqueue(store, source); return '계획'; }
    return stage === 'draft' ? JSON.stringify(fixture()) : JSON.stringify({ approved: true, findings: [], revised_bundle: fixture(), changes: [], evidence: '확인' });
  } });
  assert.deepEqual(listJobs(store).map(job => job.status), ['awaiting_user_approval', 'queued']);
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

test('fixed Instagram footer must survive review unchanged', () => {
 const b = fixture(); b.post.instagram.caption = b.post.instagram.caption.replace('첫 연재', '이번');
 // Exercise the actual validation gate before any publishing approval.
 assert.ok(validateBundle(b).some(x => x.includes('고정 안내')));
});

test('B revised bundle replaces Codex output and keeps before-and-after evidence', t => {
 const {store,source}=setup(t); const job=enqueue(store,source); const final=fixture();final.brunch='B가 보완한 최종 본문';
 runQueue(store,{call:stage => stage==='plan' ? JSON.stringify(fixture()) : stage==='draft' ? JSON.stringify(fixture()) : JSON.stringify({approved:true,findings:[],evidence:'수정',changes:['본문 보완'],revised_bundle:final})});
 assert.equal(listJobs(store)[0].status,'awaiting_user_approval');
 assert.equal(readFileSync(join(store,job.id,'brunch.md'),'utf8'),final.brunch);
 assert.notEqual(JSON.parse(readFileSync(join(store,job.id,'before-b.json'))).brunch,final.brunch);
});
test('B cannot approve a revision that changes the fixed Instagram footer', t => {
 const {store,source}=setup(t);enqueue(store,source);const final=fixture();final.post.instagram.caption=final.post.instagram.caption.replace('첫 연재','이번');
 runQueue(store,{call:stage=>stage==='plan'?'가상초안':stage==='draft'?JSON.stringify(fixture()):JSON.stringify({approved:true,findings:[],evidence:'검토',changes:['footer'],revised_bundle:final})});
 assert.equal(listJobs(store)[0].status,'paused');assert.match(listJobs(store)[0].error,/B 수정본 재검증 실패/);
});
