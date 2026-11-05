import { pathToFileURL } from 'node:url';

export function validateReview(value) {
  if (!value || typeof value.approved !== 'boolean' || typeof value.summary !== 'string' ||
      !Array.isArray(value.findings) || value.findings.some(x => typeof x !== 'string') ||
      (value.approved && value.findings.length)) throw new Error('Invalid review response');
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.error('API-key collaboration is disabled. Use node scripts/sns-queue.mjs run with subscription logins.');
  process.exitCode = 1;
}
