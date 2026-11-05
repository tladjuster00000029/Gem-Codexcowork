import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { requestReview, windowsSid } from './sns-worker-bridge.mjs';

// No API-key fallback. Authentication is performed by the official CLIs.
export function subscriptionEnv(env = process.env) {
  const clean = { ...env };
  for (const name of Object.keys(clean)) {
    if (/API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|GOOGLE_CLOUD|GOOGLE_GENAI_USE|BASE_URL|ENDPOINT|AGY_LLM_GATEWAY|AGY_ADC_AUTH|AGY_CDE|AGY_BUSINESS|ANTIGRAVITY_LS_ADDRESS|ANTIGRAVITY_AGENTAPI_EXE/i.test(name)) delete clean[name];
  }
  return clean;
}

export function invoke(executable, args, { cwd, env, input, includeStderr = false, timeoutMs = 20 * 60 * 1000 } = {}) {
  const result = spawnSync(executable, args, {
    cwd, env, input, encoding: 'utf8', windowsHide: true, timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024, shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const diagnostics = `${result.stderr || ''}\n${result.stdout || ''}`;
    if (/Please sign in|not signed in|not logged in|authentication required|unauthenticated|login required/i.test(diagnostics)) {
      throw new Error('해당 Windows 사용자의 공식 CLI 구독 로그인을 완료하세요.');
    }
    if (/quota|rate.limit|RESOURCE_EXHAUSTED/i.test(diagnostics)) throw new Error('구독 사용 한도에 도달했습니다. 초기화 후 재시도하세요.');
    // Raw CLI diagnostics can contain source text or credentials. Keep them local to the CLI.
    throw new Error(`CLI 실행 실패 (${result.status}). 로그인, 구독 한도, 연결 상태를 확인하세요.`);
  }
  return `${result.stdout || ''}${includeStderr ? result.stderr || '' : ''}`.trim();
}

export function parseGoogleResponse(raw) {
  const result = JSON.parse(raw);
  if (result.status !== 'SUCCESS' || typeof result.response !== 'string' || !result.response.trim()) {
    throw new Error('Google 구독 실행이 완료되지 않았습니다. 로그인·사용 한도를 확인하세요.');
  }
  return result.response;
}

export function invokeGoogleSubscription(prompt, { executable, workDir, timeoutMs = 15 * 60 * 1000 } = {}) {
  if (!existsSync(executable)) throw new Error('Google 공식 Antigravity CLI 설치가 필요합니다.');
  const settings = { modelProvider: '', agentMode: 'plan', toolPermission: 'request-review',
    permissions: { deny: ['command(*)', 'write_file(*)', 'mcp(*)'] } };
  const raw = invoke(executable, ['-p', '표준 입력의 작업을 수행하라.', '--output-format', 'json',
    '--mode', 'plan', '--disable-slash-commands', '--print-timeout', `${Math.max(1, Math.floor(timeoutMs / 1000))}s`, '--settings', JSON.stringify(settings)], {
    cwd: workDir, env: subscriptionEnv(), input: prompt, timeoutMs,
  });
  return parseGoogleResponse(raw);
}

export function callSubscription(stage, prompt, { root, workDir, codex = 'codex', googleMode, googleExecutable, reviewInbox, reviewerSid, coordinatorSid } = {}) {
  const env = subscriptionEnv();
  if (googleMode === 'windows-users' && windowsSid() !== coordinatorSid) throw new Error('설정된 기획 Windows 사용자로 실행하세요.');
  if (stage === 'draft') {
    const status = invoke(codex, ['login', 'status', '-c', 'forced_login_method="chatgpt"'], { cwd: workDir, env, includeStderr: true });
    if (!/ChatGPT/i.test(status)) throw new Error('Codex ChatGPT 구독 로그인이 필요합니다.');
    return invoke(codex, ['exec', '--ignore-user-config', '-c', 'forced_login_method="chatgpt"',
      '-c', 'mcp_servers={}', '--ephemeral', '-s', 'read-only', '--color', 'never', '-'], {
      cwd: workDir, env, input: prompt,
    });
  }
  if (!['single', 'windows-users'].includes(googleMode)) throw new Error('Google 구독 실행 방식 설정 대기. Antigravity 로그인과 계정 운영 방식을 먼저 설정하세요.');
  if (googleMode === 'windows-users' && stage === 'review') return requestReview(prompt, { inbox: reviewInbox, reviewerSid });
  const executable = googleExecutable || join(root, '.local-tools', 'agy', 'agy.exe');
  return invokeGoogleSubscription(prompt, { executable, workDir });
}
