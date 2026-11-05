import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, lstatSync, openSync, closeSync, unlinkSync, renameSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultStore } from './sns-queue.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const jobFiles = new Set(['source.txt', 'job.json', 'plan.txt', 'bundle.json', 'validation.json',
  'review.json', 'current_post.json', 'brunch.md', 'naver.md', 'before-fix.json', 'after-fix.json',
  'before-b.json', 'after-b-validation.json', 'editorial-snapshot.md', 'author-style-snapshot.md', 'notes.md', 'manual-snapshot.md', 'schema-snapshot.json', 'notices-snapshot.md']);
const topFiles = new Set(['theme.json', 'notifications.jsonl']);
const jobId = /^[a-f0-9-]{36}$/;
const read = file => readFileSync(file, 'utf8');
const parse = value => JSON.parse(value.replace(/^\uFEFF/, ''));
function permitted(name) {
  const parts = name.split('/');
  if (parts.length === 1) return topFiles.has(name);
  if (!jobId.test(parts[0])) return false;
  if (parts.length === 2) return jobFiles.has(parts[1]);
  return parts.length === 3 && /^attempt-\d+$/.test(parts[1]) && jobFiles.has(parts[2]);
}
function inside(store, path) {
  const rel = relative(store, path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('작업 폴더 범위 오류');
  return path;
}
function transferLock(store, action) {
  mkdirSync(dirname(store), { recursive: true });
  const lockPath = join(dirname(store), '.queue-transfer.lock');
  let fd;
  try { fd = openSync(lockPath, 'wx'); }
  catch { throw new Error('다른 PC 이동 작업이 진행 중입니다.'); }
  try {
    if (existsSync(join(store, 'run.lock')) || existsSync(join(store, 'queue.lock'))) throw new Error('실행 중인 작업이 끝난 뒤 이동하세요.');
    return action();
  } finally { closeSync(fd); unlinkSync(lockPath); }
}
function snapshot(store) {
  const files = [];
  if (!existsSync(store)) return files;
  const walk = (folder, prefix = '') => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const name = prefix + entry.name;
      const path = join(folder, entry.name);
      if (lstatSync(path).isSymbolicLink()) throw new Error('심볼릭 링크가 있는 대기열은 이동할 수 없습니다.');
      if (entry.isDirectory() && (jobId.test(name) || /^[a-f0-9-]{36}\/attempt-\d+$/.test(name))) walk(path, name + '/');
      if (entry.isFile() && permitted(name)) {
        const content = read(path);
        files.push({ name, content, sha256: sha(content) });
      }
    }
  };
  walk(store);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}
const fingerprint = files => sha(JSON.stringify(files.map(({ name, sha256 }) => [name, sha256])));
export function exportWorkspace(store, destination, { backup = false } = {}) {
  return transferLock(store, () => {
    if (existsSync(join(store, 'handoff.json'))) throw new Error('이미 다른 PC로 인계한 상태입니다.');
    const files = snapshot(store);
    const packet = { format: 'sns-workspace', version: 1, id: randomUUID(), created: new Date().toISOString(), files };
    validatePacket(packet);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify(packet), { flag: 'wx', mode: 0o600 });
    if (!backup) {
      mkdirSync(store, { recursive: true });
      writeFileSync(join(store, 'handoff.json'), JSON.stringify({ id: packet.id, fingerprint: fingerprint(files) }), { flag: 'wx' });
    }
    return { file: destination, jobs: files.filter(file => file.name.endsWith('/job.json') && file.name.split('/').length === 2).length, pausedHere: !backup };
  });
}
export function validatePacket(packet) {
  if (packet?.format !== 'sns-workspace' || packet.version !== 1 || !Array.isArray(packet.files) || packet.files.length > 10000) throw new Error('지원하지 않는 작업 이동 파일입니다.');
  const names = new Set();
  for (const file of packet.files) {
    if (typeof file.name !== 'string' || !permitted(file.name) || names.has(file.name) ||
        typeof file.content !== 'string' || file.content.length > 4 * 1024 * 1024 || sha(file.content) !== file.sha256) throw new Error('허용되지 않은 경로·중복 파일 또는 무결성 오류');
    names.add(file.name);
  }
  const jobs = new Map(packet.files.filter(file => /^[a-f0-9-]{36}\/job.json$/.test(file.name)).map(file => [file.name.split('/')[0], parse(file.content)]));
  for (const file of packet.files) {
    if (file.name.includes('/') && !jobs.has(file.name.split('/')[0])) throw new Error('작업 메타데이터가 누락됐습니다.');
  }
  for (const [id, job] of jobs) {
    const source = packet.files.find(file => file.name === `${id}/source.txt`);
    if (job.id !== id || !source || job.sourceHash !== sha(source.content) ||
        !['queued', 'paused', 'needs_revision', 'awaiting_user_approval'].includes(job.status) ||
        !['now', 'night'].includes(job.estimate?.lane)) throw new Error('작업 상태·입력 스냅샷 검증 실패');
  }
  return packet;
}
export function importWorkspace(store, sourceFile) {
  if (statSync(sourceFile).size > 80 * 1024 * 1024) throw new Error('이동 파일이 80MB를 초과합니다.');
  const packet = validatePacket(parse(read(sourceFile)));
  return transferLock(store, () => {
    const existing = snapshot(store);
    const markerPath = join(store, 'handoff.json');
    if (existing.length) {
      if (!existsSync(markerPath)) throw new Error('실행 중인 다른 작업 공간이 있습니다. 먼저 이 PC에서 내보내기를 수행하세요.');
      if (parse(read(markerPath)).fingerprint !== fingerprint(existing)) throw new Error('내보내기 후 로컬 자료가 변경됐습니다. 덮어쓰기를 중단했습니다.');
    }
    const staging = inside(dirname(store), join(dirname(store), `.queue-import-${randomUUID()}`));
    const backup = inside(dirname(store), join(dirname(store), `.queue-backup-${randomUUID()}`));
    mkdirSync(staging);
    for (const file of packet.files) {
      const path = inside(staging, join(staging, ...file.name.split('/')));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, file.content, { mode: 0o600 });
    }
    const hadStore = existsSync(store);
    if (hadStore) renameSync(store, backup);
    try { renameSync(staging, store); }
    catch (error) {
      if (hadStore) renameSync(backup, store);
      throw error;
    }
    return { jobs: packet.files.filter(file => /^[a-f0-9-]{36}\/job.json$/.test(file.name)).length, backup: hadStore ? backup : null };
  });
}
export function cancelHandoff(store) {
  return transferLock(store, () => {
    const marker = join(store, 'handoff.json');
    if (!existsSync(marker)) throw new Error('인계 대기 상태가 아닙니다.');
    if (parse(read(marker)).fingerprint !== fingerprint(snapshot(store))) throw new Error('로컬 자료가 변경됐습니다. 수동 확인이 필요합니다.');
    unlinkSync(marker);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, file] = process.argv.slice(2);
    if (command === 'export' || command === 'backup') console.log(exportWorkspace(defaultStore, resolve(file), { backup: command === 'backup' }));
    else if (command === 'import') console.log(importWorkspace(defaultStore, resolve(file)));
    else if (command === 'cancel') { cancelHandoff(defaultStore); console.log('이 PC 실행을 재개합니다. 다른 PC가 실행 중이면 먼저 중지하세요.'); }
    else throw new Error('사용법: node scripts/sns-portable.mjs export|backup|import 파일.sns-workspace.json 또는 cancel');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
