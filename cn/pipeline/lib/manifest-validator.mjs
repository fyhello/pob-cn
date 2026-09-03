import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const manifestRelativePath = 'cn/generated/manifest.json';
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const safe = value => typeof value === 'string' && value.length > 0 && !isAbsolute(value) && !/^[a-z]:/i.test(value) && !value.includes('\\') && !value.split('/').includes('..');

export function validateManifest(manifest) {
  if (!manifest || manifest.schema_version !== 1) throw new Error('manifest schema_version must be 1');
  if (!['partial_crafting_seed_pending', 'complete'].includes(manifest.completeness)) throw new Error('manifest completeness is invalid');
  if (manifest.generator?.command !== 'node cn/pipeline/generate-content.mjs' || !Number.isInteger(manifest.generator?.version) || manifest.generator.version < 1) throw new Error('manifest generator provenance is invalid');
  if (!/^[a-f0-9]{40}$/.test(manifest.upstream?.commit ?? '')) throw new Error('manifest upstream commit is invalid');
  if (!manifest.dictionary || !sha256(manifest.dictionary.gzip_sha256) || !sha256(manifest.dictionary.payload_sha256) || !sha256(manifest.dictionary.schema_sha256)) throw new Error('manifest dictionary provenance is invalid');
  if (!Array.isArray(manifest.inputs) || !manifest.inputs.length || manifest.inputs.some(input => !input?.id || !safe(input.path) || !sha256(input.sha256))) throw new Error('manifest inputs are invalid');
  if (!Array.isArray(manifest.outputs) || !manifest.outputs.length || manifest.outputs.length > 10) throw new Error('manifest outputs are invalid');
  const output = manifest.outputs.find(value => value.id === 'web.translation');
  if (!output || output.path !== 'cn/generated/web-data/translations.json' || !sha256(output.sha256) || !Number.isInteger(output.record_count) || output.record_count < 1 || !Array.isArray(output.input_ids) || !output.input_ids.length) throw new Error('manifest output input_ids or provenance is invalid');
  const allowlist = manifest.untranslated?.allowlist;
  const allowlistValid = Array.isArray(allowlist) || (allowlist && typeof allowlist === 'object' && !Array.isArray(allowlist) && Object.values(allowlist).every(value => Array.isArray(value)));
  if (!manifest.untranslated || !Number.isInteger(manifest.untranslated.count) || manifest.untranslated.count < 0 || !allowlistValid) throw new Error('manifest untranslated state is invalid');
  if (manifest.completeness === 'complete') {
    const webTranslation = manifest.outputs.find(value => value.id === 'web.translation');
    if (!webTranslation || webTranslation.path !== 'cn/generated/web-data/translations.json' || !sha256(webTranslation.sha256) || !Number.isInteger(webTranslation.record_count) || webTranslation.record_count < 1 || !Array.isArray(webTranslation.input_ids) || !webTranslation.input_ids.length) throw new Error('complete manifest web translation provenance is invalid');
    const crafting = manifest.outputs.find(value => value.id === 'web.crafting');
    if (!crafting || crafting.path !== 'cn/generated/web-data/crafting.json' || !sha256(crafting.sha256) || !Number.isInteger(crafting.record_count) || crafting.record_count < 1 || !Array.isArray(crafting.input_ids) || !manifest.crafting?.coverage) throw new Error('complete manifest crafting provenance is invalid');
    const authority = manifest.outputs.find(value => value.id === 'web.crafting-authority-v2');
    if (!authority || authority.path !== 'cn/generated/web-data/crafting-authority-v2.json' || !sha256(authority.sha256) || !Number.isInteger(authority.record_count) || authority.record_count < 1 || !Array.isArray(authority.input_ids) || !manifest.crafting.item_mods_sha256 || !manifest.crafting.item_bases_sha256) throw new Error('complete manifest crafting authority provenance is invalid');
  }
  return manifest;
}

export function assertManifestComplete(manifest, manifestPath) {
  validateManifest(manifest);
  if (!safe(manifestPath) || manifestPath !== manifestRelativePath) throw new Error(`manifest path is invalid: ${manifestPath}`);
  if (manifest.completeness !== 'complete') throw new Error(`manifest ${manifestPath} has completeness ${manifest.completeness}; crafting seed pending`);
  return manifest;
}

export async function loadManifest(repoRoot) {
  return validateManifest(JSON.parse(await readFile(resolve(repoRoot, manifestRelativePath), 'utf8')));
}

export async function assertManifestCompleteFromRepo(repoRoot) {
  return assertManifestComplete(await loadManifest(repoRoot), manifestRelativePath);
}
