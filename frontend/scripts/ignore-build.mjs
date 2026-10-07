// Vercel ignoreCommand: 0 skips, 1 builds. Unknown history always builds.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export function shouldSkip({ cwd = process.cwd(), project, previous, current }) {
  if (!/^[a-f0-9]{40}$/i.test(previous || '') || !/^[a-f0-9]{40}$/i.test(current || '') || previous === current) return false;
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
    for (const ref of [previous, current]) execFileSync('git', ['cat-file', '-e', ref + '^{commit}'], { cwd: root, stdio: 'pipe' });
    execFileSync('git', ['diff', '--quiet', previous, current, '--', project + '/'], { cwd: root, stdio: 'pipe' });
    return true;
  } catch { return false; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const project = "frontend";
  const skip = shouldSkip({ project, previous: process.env.VERCEL_GIT_PREVIOUS_SHA, current: process.env.VERCEL_GIT_COMMIT_SHA });
  console.log(skip ? 'Skipping unchanged ' + project : 'Building ' + project + ' (changed files or unknown history)');
  process.exitCode = skip ? 0 : 1;
}
