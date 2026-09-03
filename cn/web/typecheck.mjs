import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { requireCompleteManifest } from '../m3/manifest-entry-gate.mjs';

export async function typecheckWeb(repoRoot, { execute = false } = {}) {
  await requireCompleteManifest(repoRoot);
  if (!execute) return;
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  await new Promise((resolvePromise, reject) => execFile(executable, ['vue-tsc', '--noEmit'], { cwd: resolve(repoRoot, 'cn/web'), shell: process.platform === 'win32' }, error => error ? reject(error) : resolvePromise()));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) typecheckWeb(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), { execute: true }).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
