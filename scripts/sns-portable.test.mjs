import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enqueue, listJobs, runQueue } from './sns-queue.mjs';
import { exportWorkspace, importWorkspace, cancelHandoff, validatePacket } from './sns-portable.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'sns-portable-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = join(dir, 'manuscript.txt');
  writeFileSync(source, '가상 원고 데이터');
  return { dir, source, first: join(dir, 'pc-a/queue'), second: join(dir, 'pc-b/queue') };
}
test('handoff stops source PC and roundtrip preserves progress', t => {
  const { dir, source, first, second } = fixture(t);
  const job = enqueue(first, source);
  const one = join(dir, 'one.json');
  exportWorkspace(first, one);
  assert.throws(() => runQueue(first), /인계 대기/);
  assert.throws(() => enqueue(first, source), /인계 대기/);
  importWorkspace(second, one);
  assert.equal(listJobs(second)[0].id, job.id);
  const jobPath = join(second, job.id, 'job.json');
  const changed = JSON.parse(readFileSync(jobPath));
  changed.status = 'paused'; changed.stage = 'draft';
  writeFileSync(jobPath, JSON.stringify(changed));
  const two = join(dir, 'two.json');
  exportWorkspace(second, two);
  importWorkspace(first, two);
  assert.equal(listJobs(first)[0].stage, 'draft');
  assert.equal(existsSync(join(first, 'handoff.json')), false);
  assert.equal(existsSync(join(second, 'handoff.json')), true);
});
test('exports only allowed job artifacts and excludes credentials', t => {
  const { dir, source, first } = fixture(t);
  const job = enqueue(first, source);
  writeFileSync(join(first, job.id, 'auth.json'), 'secret');
  mkdirSync(join(first, '.gemini'));
  writeFileSync(join(first, '.gemini/oauth_creds.json'), 'secret');
  const file = join(dir, 'backup.json');
  exportWorkspace(first, file, { backup: true });
  assert.equal(readFileSync(file, 'utf8').includes('secret'), false);
  assert.equal(existsSync(join(first, 'handoff.json')), false);
});
test('queued jobs carry their notice snapshot to a different PC', t => {
  const { dir, source, first, second } = fixture(t);
  mkdirSync(join(dir, 'pc-a'), { recursive: true });
  writeFileSync(join(dir, 'pc-a/notices.md'), '가상 고정 안내');
  const job = enqueue(first, source);
  const file = join(dir, 'with-notices.json');
  exportWorkspace(first, file);
  importWorkspace(second, file);
  assert.equal(readFileSync(join(second, job.id, 'notices-snapshot.md'), 'utf8'), '가상 고정 안내');
});
test('invalid paths and tampered data are rejected before creating a destination', t => {
  const { dir, source, first, second } = fixture(t);
  enqueue(first, source);
  const file = join(dir, 'packet.json');
  exportWorkspace(first, file);
  const packet = JSON.parse(readFileSync(file));
  packet.files[0].name = '../auth.json';
  assert.throws(() => validatePacket(packet), /경로/);
  const original = JSON.parse(readFileSync(file));
  original.files[0].content += 'changed';
  writeFileSync(file, JSON.stringify(original));
  assert.throws(() => importWorkspace(second, file), /무결성/);
  assert.equal(existsSync(second), false);
});
test('active destination and changed source cannot be overwritten', t => {
  const { dir, source, first, second } = fixture(t);
  const job = enqueue(first, source);
  enqueue(second, source);
  const file = join(dir, 'packet.json');
  exportWorkspace(first, file);
  assert.throws(() => importWorkspace(second, file), /다른 작업 공간/);
  writeFileSync(join(first, job.id, 'source.txt'), '수동 수정');
  assert.throws(() => importWorkspace(first, file), /로컬 자료가 변경/);
});
test('running operations prevent export and a canceled handoff reactivates the source', t => {
  const { dir, source, first } = fixture(t);
  enqueue(first, source);
  writeFileSync(join(first, 'run.lock'), '');
  assert.throws(() => exportWorkspace(first, join(dir, 'blocked.json')), /실행 중인 작업/);
  rmSync(join(first, 'run.lock'));
  exportWorkspace(first, join(dir, 'valid.json'));
  cancelHandoff(first);
  assert.equal(existsSync(join(first, 'handoff.json')), false);
});
