import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gemini } from './cowork-api.mjs';
import { validatePatch, validatePayload } from './cowork-patch.mjs';

export function validateReview(value) {
  if (!value || typeof value.approved !== 'boolean' || typeof value.summary !== 'string' ||
      !Array.isArray(value.findings) || value.findings.some(x => typeof x !== 'string') ||
      (value.approved && value.findings.length)) throw new Error('Invalid review response');
  return value;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

const handoff = '\n\nYour final response MUST be a JSON object with exactly two string fields: patch and report. Before finishing, run git add -N -- . then git diff --no-ext-diff --no-textconv --binary HEAD. Put the exact cumulative diff (including new files) in patch, or an empty string when unchanged. Put your Korean explanation and exact test commands/results in report (max 2000 characters). The cumulative patch must stay within 16000 characters; stop and report when the task needs splitting. Do not commit. The next job validates this patch against the original base. Never change automation control files (.github/, approval/, scripts/cowork*.mjs, AGENTS.md, .git*, .codex/, .agents/, package*.json, open-approval.cmd). Never read secrets.';

async function main() {
  const stage = process.argv[2];
  const dir = process.env.RUNNER_TEMP;
  if (!dir) throw new Error('RUNNER_TEMP is required');
  const task = process.env.TASK;
  if (!task?.trim()) throw new Error('A task is required');
  const promptPath = join(dir, 'cowork-prompt.md');
  const reportPath = join(dir, 'cowork-report.md');
  if (stage === 'plan') {
    const files = git('ls-files');
    const readme = files.split('\n').includes('README.md') ? readFileSync('README.md', 'utf8') : '';
    const plan = await gemini(`Task:\n${task}\nFile inventory:\n${files}\nREADME:\n${readme}\nPrepare an implementation plan and measurable acceptance criteria. Codex must critically assess your plan.`);
    writeFileSync(join(dir, 'cowork.patch'), '');
    writeFileSync(reportPath, `# Gemini–Codex collaboration\n\n## Task\n${task}\n\n## Gemini plan\n${plan}\n`);
    writeFileSync(promptPath, `Implement the task below. Critically review Gemini's plan and correct it when justified. Read applicable AGENTS.md. Run meaningful tests and state exact commands/results. Do not commit, push or access secrets. Do not claim success without evidence.\n\nTask:\n${task}\n\nGemini plan:\n${plan}${handoff}`);
  } else if (stage === 'prepare') {
    const patch = validatePatch(readFileSync(join(dir, 'cowork.patch'), 'utf8'));
    if (patch) execFileSync('git', ['apply', '--'], { input: patch });
    writeFileSync(join(dir, 'codex-schema.json'), JSON.stringify({ type: 'object',
      // Keep the serialized job output below Linux's per-environment-variable limit,
      // including worst-case JSON escaping (six bytes per character).
      properties: { patch: { type: 'string', maxLength: 16000 }, report: { type: 'string', maxLength: 2000 } },
      required: ['patch', 'report'], additionalProperties: false }));
  } else if (stage === 'review') {
    // Runs on a NEW runner with an untouched checkout. Model output is data only.
    const payload = JSON.parse(process.env.CODEX_PAYLOAD ?? readFileSync(join(dir, 'codex-result.json'), 'utf8'));
    const { patch: diff, report: implementation } = validatePayload(payload);
    const review = validateReview(await gemini(`Task:\n${task}\nPlan and prior reviews:\n${readFileSync(reportPath, 'utf8')}\nCumulative diff:\n${diff}\nCodex report (test results are self-reported):\n${implementation}\nReview correctness and acceptance criteria. Approve only with no actionable findings. If evidence is missing, request it. Return approved, summary, findings.`, true));
    const round = process.env.ROUND;
    appendFileSync(reportPath, `\n## Round ${round}: Codex\n${implementation}\n\n## Round ${round}: Gemini\n${JSON.stringify(review, null, 2)}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `approved=${review.approved}\n`);
    writeFileSync(promptPath, `Continue the original task:\n${task}\n\nReview history:\n${readFileSync(reportPath, 'utf8')}\n\nCritically assess the findings. Fix valid issues; explain disagreement with evidence. Run relevant tests and give exact results.${handoff}`);
    writeFileSync(join(dir, 'cowork.patch'), diff);
    const status = review.approved ? 'Gemini review passed; human review required.' : 'Iteration limit or unresolved findings; human review required.';
    const fullReport = readFileSync(reportPath, 'utf8');
    const bodyReport = fullReport.length > 40000 ? `${fullReport.slice(0, 40000)}\n\n[Truncated: see the full cowork-round artifact.]` : fullReport;
    writeFileSync(join(dir, 'pr-body.md'), `${status}\n\n${bodyReport}`);
  } else throw new Error('Expected plan, prepare or review');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
