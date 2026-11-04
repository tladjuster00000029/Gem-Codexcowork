import { execFileSync } from 'node:child_process';

export function protectedPath(path) {
  return path.split('/').some(part => /^(?:\.git.*|\.codex|\.agents|\.approval-local|\.env(?:\..*)?|AGENTS\.md)$/i.test(part)) ||
    /^(?:approval\/|package(?:-lock)?\.json$|open-approval\.cmd$|scripts\/cowork.*\.mjs$)/i.test(path);
}

export function validatePatch(patch) {
  if (typeof patch !== 'string' || patch.length > 16000) throw new Error('Invalid patch or diff exceeds review budget; split the task');
  if (!patch) return patch;
  // Refuse symlinks and submodules; neither is necessary for ordinary code tasks.
  if (/^(?:(?:new file|new|old) mode (?:120000|160000)|index [^\r\n]* (?:120000|160000))$/m.test(patch)) {
    throw new Error('Symlinks and submodules require manual review');
  }
  const options = { input: patch, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] };
  const stats = execFileSync('git', ['apply', '--numstat', '-z', '--'], options);
  const paths = stats.split('\0').filter(Boolean).map(line => line.split('\t').slice(2).join('\t'));
  if (!paths.length || paths.some(path => !path || protectedPath(path))) {
    throw new Error('Automation control files changed; manual review required');
  }
  // Inspection only: never apply or execute generated code in the Gemini job.
  execFileSync('git', ['apply', '--check', '--'], options);
  return patch;
}

export function validatePayload(value) {
  if (!value || typeof value.report !== 'string' || value.report.length > 2000) throw new Error('Invalid Codex report');
  return { patch: validatePatch(value.patch), report: value.report };
}
