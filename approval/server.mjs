import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, unlinkSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode32, verify, validateSnapshot } from './totp.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, '..', '.approval-local');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
let lock;
try { lock = openSync(join(dataDir, 'server.lock'), 'wx', 0o600); }
catch { throw new Error('승인 화면이 이미 실행 중이거나 이전 실행이 비정상 종료됐습니다. 실행 중인 창을 확인하세요.'); }
process.on('exit', () => { closeSync(lock); unlinkSync(join(dataDir, 'server.lock')); });
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
const store = join(dataDir, 'state.json');
let state;
try { state = JSON.parse(readFileSync(store, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; state = { lastCounter: -1, failures: [], audit: [] }; }
function save() {
  writeFileSync(`${store}.tmp`, JSON.stringify(state), { mode: 0o600 });
  renameSync(`${store}.tmp`, store);
}
const repository = 'tladjuster00000029/Gem-Codexcowork';
const session = randomBytes(32).toString('hex');
const csrf = randomBytes(32).toString('hex');
let token = '';
let pendingSecret = '';
let snapshot = null;
let busy = false;
let origin;
async function github(path, options = {}) {
  if (!token) throw new Error('GitHub 연결 토큰을 먼저 입력하세요.');
  const response = await fetch(`https://api.github.com${path}`, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  if (!response.ok) throw new Error(`GitHub 요청 실패 (${response.status}). 권한·PR 상태·저장소 보호 규칙을 확인하세요.`);
  return response.json();
}
function consume(code, secret = state.secret) {
  state.failures = state.failures.filter(t => Date.now() - t < 300000);
  if (state.failures.length >= 5) throw new Error('입력이 5회 실패했습니다. 5분 뒤 다시 시도하세요.');
  const counter = secret && verify(secret, code, state.lastCounter);
  if (counter === null || counter === undefined || counter === false) {
    state.failures.push(Date.now()); save(); throw new Error('OTP가 틀렸거나 이미 사용됐습니다. 새 번호를 확인하세요.');
  }
  state.lastCounter = counter; save();
}
async function checks(sha) {
  const [runs, statuses] = await Promise.all([
    github(`/repos/${repository}/commits/${sha}/check-runs?per_page=100`),
    github(`/repos/${repository}/commits/${sha}/status?per_page=100`)
  ]);
  if (runs.total_count > 100 || statuses.total_count > 100) throw new Error('검사 수가 많아 수동 확인이 필요합니다.');
  if (!runs.total_count && !statuses.total_count) throw new Error('테스트 결과가 없습니다. 먼저 Check automation을 실행하세요.');
  if (runs.check_runs.some(r => r.status !== 'completed' || r.conclusion !== 'success') ||
      (statuses.total_count && statuses.state !== 'success')) throw new Error('완료되지 않았거나 실패한 검사가 있습니다.');
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 12000) throw new Error('Request too large'); }
  return JSON.parse(raw || '{}');
}
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  const send = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  try {
    if (req.headers.host !== new URL(origin).host) return send({ error: 'Invalid host' }, 403);
    if (req.method === 'GET' && req.url === '/') {
      res.setHeader('Set-Cookie', `session=${session}; HttpOnly; SameSite=Strict; Path=/`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(readFileSync(join(root, 'index.html')));
    }
    if (!req.headers.cookie?.split('; ').includes(`session=${session}`)) return send({ error: '화면을 다시 여세요.' }, 403);
    if (req.method === 'GET' && req.url === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); return res.end(readFileSync(join(root, 'app.js')));
    }
    if (req.method === 'GET' && req.url === '/state') return send({ csrf, enrolled: Boolean(state.secret), repository, mode: '매번 OTP 승인', connected: Boolean(token) });
    if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['x-csrf-token'] !== csrf ||
        !req.headers['content-type']?.startsWith('application/json')) return send({ error: 'Invalid request' }, 403);
    if (busy) return send({ error: '처리 중입니다.' }, 409);
    busy = true;
    try {
      const input = await body(req);
      if (req.url === '/connect') {
        token = String(input.token || '').trim(); snapshot = null;
        try { await github('/user'); } catch (error) { token = ''; throw error; }
        return send({ message: '연결됐습니다. 토큰은 메모리에만 보관됩니다.' });
      }
      if (req.url === '/enroll') {
        if (state.secret) throw new Error('OTP가 이미 등록돼 있습니다.');
        pendingSecret = encode32(randomBytes(20));
        return send({ secret: pendingSecret, message: 'Authenticator에서 + → 설정 키 입력 → 이름 Gem-Codex 승인, 시간 기준으로 등록하세요.' });
      }
      if (req.url === '/confirm-enrollment') {
        if (state.secret || !pendingSecret) throw new Error('등록을 먼저 시작하세요.');
        consume(input.otp, pendingSecret); state.secret = pendingSecret; pendingSecret = ''; save();
        return send({ message: 'OTP 등록 완료. 다음 새 번호부터 승인에 사용할 수 있습니다.' });
      }
      if (req.url === '/preview') {
        snapshot = null;
        if (!/^[1-9]\d*$/.test(String(input.number))) throw new Error('올바른 PR 번호를 입력하세요.');
        const pr = await github(`/repos/${repository}/pulls/${input.number}`);
        const candidate = { number: pr.number, sha: pr.head.sha, base: pr.base.ref, baseSha: pr.base.sha, created: Date.now() };
        validateSnapshot(pr, candidate, repository);
        const repo = await github(`/repos/${repository}`);
        if (candidate.base !== repo.default_branch) throw new Error('기본 브랜치로 향하는 PR만 승인할 수 있습니다.');
        await checks(candidate.sha);
        snapshot = candidate;
        return send({ title: pr.title, sha: candidate.sha, url: pr.html_url, message: 'GitHub 링크에서 변경 내용을 확인한 뒤 OTP로 승인하세요. 5분 뒤 만료됩니다.' });
      }
      if (req.url === '/approve') {
        if (!state.secret || !snapshot) throw new Error('OTP 등록 및 PR 확인이 필요합니다.');
        const approved = snapshot;
        const pr = await github(`/repos/${repository}/pulls/${approved.number}`);
        validateSnapshot(pr, approved, repository);
        await checks(approved.sha);
        consume(input.otp);
        snapshot = null;
        state.audit.push({ time: new Date().toISOString(), pr: approved.number, sha: approved.sha, result: 'attempt' }); save();
        const merged = await github(`/repos/${repository}/pulls/${approved.number}/merge`, { method: 'PUT', body: JSON.stringify({ sha: approved.sha, merge_method: 'squash' }) });
        if (!merged.merged) throw new Error('GitHub에서 병합하지 못했습니다. PR을 다시 확인하세요.');
        state.audit.push({ time: new Date().toISOString(), pr: approved.number, sha: approved.sha, result: 'merged' }); save();
        return send({ message: `PR #${approved.number} 반영 완료.` });
      }
      return send({ error: 'Not found' }, 404);
    } finally { busy = false; }
  } catch (error) { send({ error: error.message }, 400); }
});
server.listen(0, '127.0.0.1', () => { origin = `http://127.0.0.1:${server.address().port}`; console.log(`승인 화면: ${origin}\n종료하려면 Ctrl+C. OTP와 토큰을 채팅에 보내지 마세요.`); });
