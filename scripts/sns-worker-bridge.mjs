import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha = text => createHash('sha256').update(text).digest('hex');
const parse = file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
function save(file, value) {
  writeFileSync(`${file}.tmp`, JSON.stringify(value), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
export function windowsSid() {
  const result = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  const sid = result.match(/S-1-5-\d+(?:-\d+)+/i)?.[0];
  if (!sid) throw new Error('Windows 실행 사용자 SID 확인 실패');
  return sid;
}
export function requestReview(prompt, { inbox, reviewerSid, coordinatorSid = windowsSid(), timeoutMs = 18 * 60 * 1000, wait = sleep } = {}) {
  if (!inbox || !/^S-1-5-\d+(?:-\d+)+$/.test(reviewerSid || '') || reviewerSid === coordinatorSid) {
    throw new Error('검토용 Windows 사용자를 별도로 설정하세요.');
  }
  const id = randomUUID();
  const folder = join(inbox, id);
  mkdirSync(folder, { recursive: true });
  const request = { version: 1, id, role: 'review', prompt, promptHash: sha(prompt), reviewerSid,
    deadline: Date.now() + timeoutMs };
  save(join(folder, 'request.json'), request);
  const resultPath = join(folder, 'result.json');
  while (Date.now() < request.deadline) {
    if (existsSync(resultPath)) {
      const result = parse(resultPath);
      if (result.id !== id || result.promptHash !== request.promptHash || result.windowsSid !== reviewerSid) throw new Error('검토 작업·실행 사용자 대조 실패');
      if (!result.success || typeof result.response !== 'string' || !result.response.trim()) throw new Error(result.error || '검토 작업 실패');
      return result.response;
    }
    wait(1000);
  }
  writeFileSync(join(folder, 'canceled'), 'timeout');
  throw new Error('검토용 Windows 사용자 작업 대기 시간 초과. 해당 사용자의 로그인과 예약 작업 상태를 확인하세요.');
}
export function processReviews(inbox, { sid = windowsSid(), call } = {}) {
  mkdirSync(inbox, { recursive: true });
  const lockPath = join(inbox, 'worker.lock');
  let lock;
  try { lock = openSync(lockPath, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') return 0; throw error; }
  let completed = 0;
  try {
    for (const entry of readdirSync(inbox, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
      const folder = join(inbox, entry.name);
      const path = join(folder, 'request.json');
      if (!existsSync(path) || existsSync(join(folder, 'result.json')) || existsSync(join(folder, 'canceled'))) continue;
      const request = parse(path);
      if (request.reviewerSid !== sid) continue;
      if (request.version !== 1 || request.role !== 'review' || request.id !== entry.name ||
          typeof request.prompt !== 'string' || request.prompt.length > 1000000 || request.promptHash !== sha(request.prompt) ||
          !Number.isFinite(request.deadline) || request.deadline <= Date.now()) continue;
      renameSync(path, join(folder, 'working.json'));
      const result = { id: request.id, promptHash: request.promptHash, windowsSid: sid, success: false };
      try {
        const remaining = request.deadline - Date.now() - 5000;
        if (remaining <= 0) throw new Error('검토 결과 저장을 위한 시간이 부족합니다. 새 요청으로 재시도하세요.');
        result.response = call(request.prompt, folder, Math.min(15 * 60 * 1000, remaining));
        result.success = true;
      }
      catch (error) { result.error = error.message; }
      save(join(folder, 'result.json'), result);
      completed += 1;
    }
  } finally { closeSync(lock); unlinkSync(lockPath); }
  return completed;
}
async function main() {
    const [inbox, executable] = process.argv.slice(2);
    if (!inbox || !executable) throw new Error('사용법: node scripts/sns-worker-bridge.mjs 공유검토폴더 agy.exe');
    const { invokeGoogleSubscription } = await import('./subscription-cli.mjs');
    const sid = windowsSid();
    mkdirSync(resolve(inbox), { recursive: true });
    save(join(resolve(inbox), 'health.json'), { windowsSid: sid, time: new Date().toISOString() });
    console.log(`검토 완료 ${processReviews(resolve(inbox), { sid, call: (prompt, folder, timeoutMs) => invokeGoogleSubscription(prompt, {
      executable: resolve(executable), workDir: folder, timeoutMs,
    }) })}개`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
