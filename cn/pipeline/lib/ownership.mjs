import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

const writer = 'node cn/pipeline/generate-content.mjs';
const generatedRules = [
  { output: 'cn/generated/web-data/**', producer: writer },
  { output: 'cn/generated/manifest.json', producer: writer },
];
const localExcludes = ['.worktrees/**', 'Settings.xml', '**/imgui.ini', 'Builds/**', 'node_modules/**', 'tools/last_imported_build.xml', '**/*.cfg', '**/*.exe', '**/*.dll', '.git/**', '**/*.tmp', '**/*.temp', '**/.DS_Store'];
const hash = value => createHash('sha256').update(value).digest('hex');
const safe = path => typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !/^[a-z]:/i.test(path) && !path.includes('\\') && !path.split('/').includes('..');
const matches = (path, pattern) => pattern.endsWith('/**') ? path.startsWith(pattern.slice(0, -2)) : path === pattern;

function requireStage(options) {
  if (!options?.stage) throw new Error('stage is required');
}

export async function loadPipelineOwnership(repoRoot) {
  const configPath = resolve(repoRoot, 'cn/config/pipeline-ownership.json');
  const ownership = JSON.parse(await readFile(configPath, 'utf8'));
  if (ownership.schema_version !== 1 || ownership.ownership_yml_path !== 'cn/config/ownership.yml' || !safe(ownership.ownership_yml_path)) throw new Error('invalid ownership YAML path');
  const yaml = await readFile(resolve(repoRoot, ownership.ownership_yml_path));
  if (ownership.ownership_yml_sha256 !== hash(yaml)) throw new Error('ownership YAML hash mismatch');
  if (JSON.stringify(ownership.generated_rules) !== JSON.stringify(generatedRules)) throw new Error('generated rule projection mismatch');
  if (JSON.stringify(ownership.local_excludes) !== JSON.stringify(localExcludes)) throw new Error('LOCAL projection mismatch');
  return ownership;
}

export function assertGeneratedPath(relativePath, ownership) {
  if (!safe(relativePath)) throw new Error('generated path must be repository-relative');
  const matchesRules = (ownership.generated_rules ?? []).filter(rule => matches(relativePath, rule.output));
  if (matchesRules.length !== 1 || matchesRules[0].producer !== writer) throw new Error('generated path has no unique approved producer');
  return matchesRules[0];
}

export function assertGeneratedOnlyBusinessChanges(changeSet, ownership, contract, options) {
  requireStage(options);
  const allowed = new Set((contract.outputs ?? []).filter(output => output.stage === options.stage).map(output => output.path));
  for (const changes of Object.values(changeSet)) for (const change of changes ?? []) {
    const path = typeof change === 'string' ? change : change.path;
    if (!allowed.has(path)) throw new Error(`business change is not a selected generated contract output: ${path}`);
    assertGeneratedPath(path, ownership);
  }
}
