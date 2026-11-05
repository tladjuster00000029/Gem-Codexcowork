import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requestReview, processReviews } from './sns-worker-bridge.mjs';

const planner = 'S-1-5-21-100-1000';
const reviewer = 'S-1-5-21-100-1001';
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'sns-review-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('requires a distinct Windows identity for review', t => {
  assert.throws(() => requestReview('원고', { inbox: setup(t), reviewerSid: planner, coordinatorSid: planner }), /별도로/);
});
test('dispatches only to the configured Windows reviewer and runs once', t => {
  const inbox = setup(t);
  let called = 0;
  const result = requestReview('가상 검토 입력', {
    inbox, reviewerSid: reviewer, coordinatorSid: planner,
    wait: () => {
      assert.equal(processReviews(inbox, { sid: planner, call: () => { throw new Error('Wrong user'); } }), 0);
      processReviews(inbox, { sid: reviewer, call: prompt => { called += 1; assert.equal(prompt, '가상 검토 입력'); return '검토 결과'; } });
    },
  });
  assert.equal(result, '검토 결과');
  assert.equal(called, 1);
  assert.equal(processReviews(inbox, { sid: reviewer, call: () => { throw new Error('Duplicate call'); } }), 0);
});
test('mismatched result identities are rejected', t => {
  const inbox = setup(t);
  assert.throws(() => requestReview('가상 입력', {
    inbox, reviewerSid: reviewer, coordinatorSid: planner,
    wait: () => {
      const id = readdirSync(inbox).find(name => name.includes('-'));
      const request = JSON.parse(readFileSync(join(inbox, id, 'request.json')));
      writeFileSync(join(inbox, id, 'result.json'), JSON.stringify({ id, promptHash: request.promptHash, windowsSid: planner, success: true, response: '위조' }));
    },
  }), /실행 사용자/);
});
test('provider errors pause the coordinator without a different account fallback', t => {
  const inbox = setup(t);
  assert.throws(() => requestReview('가상 입력', {
    inbox, reviewerSid: reviewer, coordinatorSid: planner,
    wait: () => processReviews(inbox, { sid: reviewer, call: () => { throw new Error('구독 한도'); } }),
  }), /구독 한도/);
});
test('reviewer leaves time to save the result before the parent deadline', t => {
  const inbox = setup(t);
  const response = requestReview('가상 입력', {
    inbox, reviewerSid: reviewer, coordinatorSid: planner, timeoutMs: 10000,
    wait: () => processReviews(inbox, { sid: reviewer, call: (prompt, folder, budget) => {
      assert.ok(budget > 0 && budget <= 5000);
      return '검토 완료';
    } }),
  });
  assert.equal(response, '검토 완료');
});
