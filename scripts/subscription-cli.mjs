import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// No API-key fallback. Authentication is performed by the official CLIs.
export function subscriptionEnv(env = process.env) {
  const clean = { ...env };
  for (const name of Object.keys(clean)) {
    if (/API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|GOOGLE_CLOUD_PROJECT|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_GENAI_USE_GCA|BASE_URL|ENDPOINT/i.test(name)) delete clean[name];
  }
  return clean;
}

export function invoke(executable, args, { cwd, env, input, includeStderr = false } = {}) {
  const result = spawnSync(executable, args, {
    cwd, env, input, encoding: 'utf8', windowsHide: true, timeout: 20 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024, shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    // Raw CLI diagnostics can contain source text or credentials. Keep them local to the CLI.
    throw new Error(`CLI 실행 실패 (${result.status}). 로그인, 구독 한도, 연결 상태를 확인하세요.`);
  }
  return `${result.stdout || ''}${includeStderr ? result.stderr || '' : ''}`.trim();
}

export function callSubscription(stage, prompt, { root, workDir, codex = 'codex', geminiEntry } = {}) {
  const env = subscriptionEnv();
  if (stage === 'draft') {
    const status = invoke(codex, ['login', 'status', '-c', 'forced_login_method="chatgpt"'], { cwd: workDir, env, includeStderr: true });
    if (!/ChatGPT/i.test(status)) throw new Error('Codex ChatGPT 구독 로그인이 필요합니다.');
    return invoke(codex, ['exec', '--ignore-user-config', '-c', 'forced_login_method="chatgpt"',
      '-c', 'mcp_servers={}', '--ephemeral', '-s', 'read-only', '--color', 'never', '-'], {
      cwd: workDir, env, input: prompt,
    });
  }
  const account = stage === 'plan' ? 'gemini-a' : 'gemini-b';
  const profile = join(root, '.runtime', account);
  const settingsPath = join(profile, '.gemini', 'settings.json');
  if (!existsSync(settingsPath)) throw new Error(`${account}: 먼저 Google 구독 계정으로 로그인하세요.`);
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, ''));
  if (settings.security?.auth?.selectedType !== 'oauth-personal') throw new Error(`${account}: Google 로그인 방식만 허용됩니다.`);
  const packageDir = join(root, '.local-tools', 'node_modules', '@google', 'gemini-cli');
  const manifest = join(packageDir, 'package.json');
  const entry = geminiEntry || (existsSync(manifest) && join(packageDir, JSON.parse(readFileSync(manifest, 'utf8')).bin.gemini));
  if (!existsSync(entry)) throw new Error('Gemini 공식 CLI 설치가 필요합니다.');
  const raw = invoke(process.execPath, [entry, '--skip-trust', '-p', '표준 입력의 작업을 수행하라.', '--output-format', 'json', '--approval-mode', 'plan'], {
    cwd: workDir, env: { ...env, GEMINI_CLI_HOME: profile }, input: prompt,
  });
  const result = JSON.parse(raw);
  if (result.error || typeof result.response !== 'string' || !result.response.trim()) throw new Error('Gemini 응답이 비어 있거나 오류가 있습니다.');
  return result.response;
}
