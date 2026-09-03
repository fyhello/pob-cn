import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const posix = value => value.split(sep).join('/');
const temporary = path => /(^|\/)(?:\.DS_Store|~\$[^/]*|[^/]*\.(?:tmp|temp))$/i.test(path);
const glob = (path, pattern) => {
  const expression = `^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')}$`;
  return new RegExp(expression).test(path);
};

function ignoredByGit(root, path) {
  if (!existsSync(resolve(root, '.git'))) {
    const ignore = resolve(root, '.gitignore');
    return existsSync(ignore) && readFileSync(ignore, 'utf8').split(/\r?\n/).filter(Boolean).some(pattern => glob(path, pattern));
  }
  const result = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', path], { stdio: 'ignore' });
  return result.status === 0;
}

function trackedByGit(root, path) {
  if (!existsSync(resolve(root, '.git'))) return true;
  return spawnSync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', path], { stdio: 'ignore' }).status === 0;
}

function excluded(path, ownership) {
  return path === '.git' || path.startsWith('.git/') || temporary(path)
    || (ownership.local_excludes ?? []).some(pattern => glob(path, pattern));
}

export async function snapshotBusinessTree(repoRoot, ownership) {
  const root = resolve(repoRoot);
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      const path = posix(relative(root, absolute));
      if (!path || excluded(path, ownership) || ignoredByGit(root, path)) continue;
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error(`business snapshot rejects symbolic link: ${path}`);
      if (stat.isDirectory()) await walk(absolute);
      else if (stat.isFile()) files.push({ path, sha256: sha256(await readFile(absolute)), missing: false, state: trackedByGit(root, path) ? 'tracked' : 'untracked' });
    }
  }
  await walk(root);
  return { files: files.sort((left, right) => left.path.localeCompare(right.path)) };
}

export function diffBusinessSnapshots(before, after) {
  const oldFiles = new Map((before.files ?? []).map(file => [file.path, file]));
  const newFiles = new Map((after.files ?? []).map(file => [file.path, file]));
  const diff = { added: [], modified: [], deleted: [], untracked: [] };
  for (const [path, file] of newFiles) {
    const old = oldFiles.get(path);
    if (!old) diff[file.state === 'untracked' ? 'untracked' : 'added'].push({ path, before: null, after: file.sha256 });
    else if (old.sha256 !== file.sha256) diff.modified.push({ path, before: old.sha256, after: file.sha256 });
  }
  for (const [path, file] of oldFiles) if (!newFiles.has(path)) diff.deleted.push({ path, before: file.sha256, after: null });
  return diff;
}

export function formatBusinessSnapshotDiff(diff) {
  return ['added', 'modified', 'deleted', 'untracked'].flatMap(type => (diff[type] ?? []).map(change => `${change.path} ${type} ${change.before ?? '-'} -> ${change.after ?? '-'}`)).join('\n');
}
