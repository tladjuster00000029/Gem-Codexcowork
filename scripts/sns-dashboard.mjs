import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, defaultStore, enqueue, listJobs, retryJob } from './sns-queue.mjs';

const token = randomBytes(32).toString('hex');
const port = Number(process.env.SNS_DASHBOARD_PORT || 8765);
const origin = `http://127.0.0.1:${port}`;
let worker;
function startWorker() {
  if (worker) return;
  worker = spawn(process.execPath, [join(root, 'scripts/sns-queue.mjs'), 'run'], {
    cwd: root, windowsHide: true, stdio: 'ignore',
  });
  worker.once('exit', () => { worker = undefined; });
  worker.once('error', () => { worker = undefined; });
}
const page = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>SNS 작업</title>
<style>body{font:16px 'Segoe UI',sans-serif;max-width:900px;margin:40px auto;padding:0 24px;background:#faf9f6;color:#222}textarea,input,button{font:inherit;padding:10px;box-sizing:border-box}textarea{width:100%;min-height:180px}button{cursor:pointer;margin:8px 8px 8px 0}article{background:white;padding:18px;margin:12px 0;border:1px solid #ddd;border-radius:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#666}</style>
<h1>SNS 원고 작업</h1><p>원고를 등록하면 예상 작업량을 알리고 처리합니다. 긴 작업은 오전 3~6시에 실행합니다.</p>
<label for="source">도서 원고</label><textarea id="source" placeholder="이번 회차 원고를 붙여넣으세요"></textarea>
<label><input type="checkbox" id="urgent"> 급한 작업 · 지금 처리</label><br>
<button id="add">작업 등록</button><button id="run">대기 작업 확인</button>
<p id="message" role="status"></p><p><small>완성된 결과는 사용자 승인 대기 상태로 저장됩니다. 실제 게시와 발송은 결과 확인 후 진행합니다.</small></p>
<h2>작업 목록</h2><section id="jobs"></section><h2>결과</h2><pre id="output"></pre>
<script>
const token=${JSON.stringify(token)};
async function request(path, body) {
  const options=body ? {method:'POST',headers:{'Content-Type':'application/json','X-SNS-Token':token},body:JSON.stringify(body)} : {headers:{'X-SNS-Token':token}};
  const response=await fetch(path,options); const data=await response.json();
  if(!response.ok) throw new Error(data.error); return data;
}
const labels={queued:'대기 중',running:'처리 중',paused:'로그인·한도 확인 필요',needs_revision:'검토·수정 필요',awaiting_user_approval:'사용자 승인 대기'};
async function refresh(){
 const jobs=await request('/jobs'); document.querySelector('#jobs').replaceChildren();
 for(const job of jobs){
  const article=document.createElement('article'); const heading=document.createElement('strong');
  heading.textContent=labels[job.status]||job.status; article.append(heading);
  const detail=document.createElement('p'); detail.textContent=job.id+' · '+job.estimate.minutes+' · 사용량 '+job.estimate.usage+' · '+(job.estimate.lane==='night'?'새벽 처리':'지금 처리'); article.append(detail);
  if(job.error){const error=document.createElement('p');error.textContent=job.error;article.append(error);}
  for(const file of ['brunch.md','naver.md','current_post.json','review.json','validation.json']){
   const button=document.createElement('button');button.textContent=file;
   button.onclick=()=>request('/result/'+job.id+'/'+file).then(data=>document.querySelector('#output').textContent=data.text).catch(showError); article.append(button);
  }
  if(['paused','needs_revision','queued'].includes(job.status)){
   const button=document.createElement('button');button.textContent='지금 처리 / 재시도';
   button.onclick=()=>request('/retry',{id:job.id}).then(refresh).catch(showError);article.append(button);
  }
  document.querySelector('#jobs').append(article);
 }
}
function showError(error){document.querySelector('#message').textContent=error.message;}
document.querySelector('#add').onclick=async()=>{try{
 const data=await request('/add',{source:document.querySelector('#source').value,urgent:document.querySelector('#urgent').checked});
 document.querySelector('#message').textContent='등록 완료 · '+data.estimate.minutes+' · 사용량 '+data.estimate.usage+' · '+(data.estimate.lane==='night'?'새벽 처리':'지금 처리');await refresh();
}catch(error){showError(error);}};
document.querySelector('#run').onclick=()=>request('/run',{}).then(refresh).catch(showError);
refresh().catch(showError);setInterval(()=>refresh().catch(showError),5000);
</script></html>`;

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
  const send = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) return send({ error: 'Invalid host' }, 403);
    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(page);
    }
    if (req.headers['x-sns-token'] !== token) return send({ error: '화면을 새로 여세요.' }, 403);
    if (req.method === 'GET' && req.url === '/jobs') return send(listJobs(defaultStore));
    const match = /^\/result\/([a-f0-9-]{36})\/(brunch\.md|naver\.md|current_post\.json|review\.json|validation\.json)$/.exec(req.url);
    if (req.method === 'GET' && match) return send({ text: readFileSync(join(defaultStore, match[1], match[2]), 'utf8') });
    if (req.method !== 'POST' || req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return send({ error: 'Invalid request' }, 403);
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 500000) return send({ error: '원고가 너무 깁니다.' }, 413); }
    const body = JSON.parse(raw);
    if (req.url === '/add') {
      if (typeof body.source !== 'string') throw new Error('원고를 입력하세요.');
      const input = join(root, '.runtime', 'dashboard-input.txt');
      writeFileSync(input, body.source, { mode: 0o600 });
      const job = enqueue(defaultStore, input, { urgent: body.urgent === true, origin: 'local-dashboard' });
      send(job); startWorker(); return;
    }
    if (req.url === '/retry') { retryJob(defaultStore, body.id, { urgent: true }); send({ ok: true }); startWorker(); return; }
    if (req.url === '/run') { send({ ok: true }); startWorker(); return; }
    send({ error: 'Not found' }, 404);
  } catch (error) { send({ error: error.code === 'ENOENT' ? '아직 생성된 결과가 없습니다.' : error.message }, 400); }
});
mkdirSync(join(root, '.runtime'), { recursive: true });
server.listen(port, '127.0.0.1', () => console.log(`SNS 작업 화면 ${origin}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
