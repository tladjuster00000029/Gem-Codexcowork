const $ = id => document.getElementById(id);
let csrf;
async function status() {
  const state = await (await fetch('/state')).json(); csrf = state.csrf;
  $('enrollment').hidden = state.enrolled;
}
async function post(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  $('message').textContent = result.message || '';
  return result;
}
function on(id, action) {
  $(id).onclick = async () => {
    for (const b of document.querySelectorAll('button')) b.disabled = true;
    try { await action(); } catch (error) { $('message').textContent = error.message; }
    finally { for (const b of document.querySelectorAll('button')) if (b.id !== 'approve') b.disabled = false; }
  };
}
on('connect', async () => { try { await post('/connect', { token: $('token').value }); } finally { $('token').value = ''; $('approve').disabled = true; } });
on('enroll', async () => { const result = await post('/enroll', {}); $('secret').textContent = result.secret; });
on('confirm', async () => { try { await post('/confirm-enrollment', { otp: $('setupOtp').value }); $('secret').textContent = ''; await status(); } finally { $('setupOtp').value = ''; } });
on('preview', async () => { $('approve').disabled = true; $('link').hidden = true; $('details').textContent = ''; const r = await post('/preview', { number: $('number').value }); $('details').textContent = `${r.title}\nコード版 / 코드 버전: ${r.sha}`; $('link').href = r.url; $('link').hidden = false; $('approve').disabled = false; });
on('approve', async () => { try { await post('/approve', { otp: $('otp').value }); } finally { $('otp').value = ''; $('approve').disabled = true; } });
$('number').oninput = () => { $('approve').disabled = true; $('details').textContent = ''; $('link').hidden = true; };
status().then(() => { $('message').textContent = 'OTP 승인이 기본입니다. GitHub 연결부터 진행하세요.'; }).catch(() => { $('message').textContent = '승인 화면에 연결할 수 없습니다.'; });
