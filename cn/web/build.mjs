import { requireCompleteManifest } from '../m3/manifest-entry-gate.mjs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

function run(command, args, cwd) {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command;
  return new Promise((resolvePromise, reject) => execFile(executable, args, { cwd, shell: process.platform === 'win32' }, error => error ? reject(error) : resolvePromise()));
}

export async function buildWeb(repoRoot, { execute = false } = {}) {
  await requireCompleteManifest(repoRoot);
  if (execute) await run('npm', ['run', 'build:raw'], resolve(repoRoot, 'cn/web'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) buildWeb(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), { execute: true }).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
