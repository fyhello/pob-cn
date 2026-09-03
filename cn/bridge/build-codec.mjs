function requireXml(value) {
  if (typeof value?.xml !== 'string' || !value.xml.trim().startsWith('<')) throw new Error('build XML is required');
  if (value.xml.includes('\0')) throw new Error('build XML contains a NUL byte');
}

export function importBuildEnvelope(value) {
  requireXml(value);
  return Object.freeze({ name: typeof value.name === 'string' ? value.name : '', xml: value.xml });
}

export function exportBuildEnvelope(build) {
  requireXml(build);
  return JSON.stringify({ format: 'pob-cn-build-v1', name: build.name, xml: build.xml });
}

export function parseExportedBuild(value) {
  const parsed = JSON.parse(value);
  if (parsed.format !== 'pob-cn-build-v1') throw new Error('unsupported build export format');
  return importBuildEnvelope(parsed);
}
