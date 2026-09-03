import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultOutput = resolve(repositoryRoot, "docs", "architecture", "legacy-source-manifest.json");
const requiredPaths = [
  "start-nextgen.bat",
  "tweak_changelogs.sh",
  "test_fix_ascendancy_positions.py",
  "pob-nextgen/src/components/ItemCraftingModal.vue",
  "pob-nextgen/src/components/ItemCraftingStudio.vue",
  "pob-nextgen/src/components/ItemTunerPanel.vue",
  "pob-nextgen/src/data/affixes.json",
  "pob-nextgen/src/data/craftingData.json",
  "tools/build_crafting_data.mjs",
  "tools/test_full_system_e2e.mjs",
];
const scopedRoots = ["src/", "core-bridge/", "pob-nextgen/", "tools/"];
const rootSourcePattern = /^(README_CN\.md|[^/]+\.(?:bat|mjs|js|lua|ps1|py|sh))$/i;

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  const options = { legacyRoot: null, output: defaultOutput, generatedAt: null, verify: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--legacy-root") options.legacyRoot = argv[++index];
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--generated-at") options.generatedAt = argv[++index];
    else if (argument === "--verify") options.verify = true;
    else fail(`Unknown argument: ${argument}`);
  }
  if (!options.legacyRoot) fail("--legacy-root is required");
  if (!options.generatedAt && !options.verify) fail("--generated-at is required for deterministic generation");
  return options;
}

function git(legacyRoot, argumentsList) {
  const result = spawnSync("git", ["-C", legacyRoot, ...argumentsList], { encoding: "utf8" });
  if (result.status !== 0) fail(`git ${argumentsList.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function posixPath(value) {
  return value.replaceAll("\\", "/");
}

function isLocal(pathname) {
  const path = pathname.toLowerCase();
  return path === "settings.xml" ||
    path.endsWith("/imgui.ini") ||
    path === "imgui.ini" ||
    path.startsWith("builds/") ||
    path.includes("/node_modules/") ||
    path.startsWith("node_modules/") ||
    path === "tools/last_imported_build.xml" ||
    path.endsWith(".cfg") ||
    path.endsWith(".exe") ||
    path.endsWith(".dll");
}

function isScopedSource(pathname) {
  return scopedRoots.some((root) => pathname.startsWith(root)) || rootSourcePattern.test(pathname);
}

function parseStatus(legacyRoot) {
  const entries = git(legacyRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0");
  const statuses = new Map();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const status = entry.slice(0, 2);
    const pathname = posixPath(entry.slice(3));
    statuses.set(pathname, status);
    if (status.includes("R") || status.includes("C")) {
      const originalPath = posixPath(entries[++index] ?? "");
      if (originalPath) statuses.set(originalPath, status);
    }
  }
  return statuses;
}

function parseHeadEntries(legacyRoot) {
  const output = git(legacyRoot, ["ls-tree", "-r", "-z", "HEAD", "--", ...scopedRoots]);
  const entries = [];
  for (const entry of output.split("\0")) {
    if (!entry) continue;
    const separator = entry.indexOf("\t");
    const [mode, type, hash] = entry.slice(0, separator).split(" ");
    entries.push({ path: posixPath(entry.slice(separator + 1)), mode, type, hash });
  }

  const rootEntries = git(legacyRoot, ["ls-tree", "-z", "HEAD"]).split("\0");
  for (const entry of rootEntries) {
    if (!entry) continue;
    const separator = entry.indexOf("\t");
    const pathname = posixPath(entry.slice(separator + 1));
    if (!rootSourcePattern.test(pathname)) continue;
    const [mode, type, hash] = entry.slice(0, separator).split(" ");
    entries.push({ path: pathname, mode, type, hash });
  }
  return entries;
}

function sha256(filename) {
  return createHash("sha256").update(readFileSync(filename)).digest("hex");
}

function decisionFor(pathname) {
  if (pathname === "sync_upstream.ps1") return { decision: "迁移", phase: "M4", reason: "Rewrite as a version-lock-driven candidate sync script." };
  if (pathname === "README_CN.md") return { decision: "迁移", phase: "M4", reason: "Curate legacy Chinese documentation into docs/." };
  if (pathname === "start-nextgen.bat" || pathname === "tweak_changelogs.sh" || pathname === "test_fix_ascendancy_positions.py") return { decision: "归档", phase: null, reason: "Retain only as legacy evidence; reassess from a clean workflow later." };
  if (pathname.startsWith("src/PatchCore/") || pathname.startsWith("src/DataPatch/") || pathname.startsWith("src/CustomUI/")) return { decision: "迁移", phase: "M1", reason: "Rewrite behind the tested bootstrap boundary." };
  if (pathname.startsWith("src/i18n/")) return { decision: "迁移", phase: "M2", reason: "Split tracked overrides from regenerated dictionary outputs." };
  if (pathname.startsWith("core-bridge/")) return { decision: "迁移", phase: "M3", reason: "Rewrite with timeout, exit recovery, and golden tests." };
  if (pathname.startsWith("pob-nextgen/src/data/")) return { decision: "不迁移", phase: "M2", reason: "Replace legacy web data with the sole generated web-data output." };
  if (pathname.startsWith("pob-nextgen/")) return { decision: "迁移", phase: "M3", reason: "Move application source and build configuration under cn/web/." };
  if (pathname.startsWith("tools/dict-pipeline/upstream-builder/")) return { decision: "归档", phase: null, reason: "Keep as legacy provenance; do not copy vendor caches, binaries, or generated data." };
  if (pathname.startsWith("tools/dict-pipeline/")) return { decision: "迁移", phase: "M2", reason: "Audit and consolidate into the single content pipeline." };
  if (pathname === "tools/build_crafting_data.mjs") return { decision: "迁移", phase: "M2", reason: "Audit before consolidating crafting data generation." };
  if (pathname.startsWith("tools/test_") || pathname.startsWith("tools/debug_") || pathname.startsWith("tools/run_") || pathname.startsWith("tools/check_") || pathname.startsWith("tools/inspect_")) return { decision: "归档", phase: null, reason: "Selectively rewrite deterministic, sanitized tests only." };
  if (pathname.startsWith("tools/") && /\.(json|txt|xml|pyc|wasm)$/i.test(pathname)) return { decision: "不迁移", phase: null, reason: "Treat raw, report, cache, binary, and generated artifacts as non-source inputs." };
  if (pathname.startsWith("tools/")) return { decision: "迁移", phase: "M2", reason: "Consolidate valid generator logic into the single content pipeline." };
  return { decision: "归档", phase: null, reason: "Outside a planned migration target; retain as legacy evidence only." };
}

function makeRecord(legacyRoot, entry, status, source) {
  const absolutePath = resolve(legacyRoot, entry.path);
  const present = existsSync(absolutePath);
  const decision = decisionFor(entry.path);
  return {
    path: entry.path,
    source,
    git_worktree_status: status ?? (source === "UNTRACKED_WORKTREE" ? "??" : "CLEAN"),
    head_blob_hash: entry.hash ?? null,
    head_blob_mode: entry.mode ?? null,
    worktree_state: present ? "PRESENT" : "MISSING",
    current_worktree_sha256: present ? sha256(absolutePath) : null,
    decision: decision.decision,
    target_phase: decision.phase,
    decision_reason: decision.reason,
  };
}

function buildManifest(legacyRoot, generatedAt) {
  const normalizedRoot = resolve(legacyRoot);
  const statuses = parseStatus(normalizedRoot);
  const headEntries = parseHeadEntries(normalizedRoot)
    .filter((entry) => !isLocal(entry.path));
  const records = new Map();
  for (const entry of headEntries) records.set(entry.path, makeRecord(normalizedRoot, entry, statuses.get(entry.path), "TRACKED_HEAD"));
  for (const [pathname, status] of statuses) {
    if (status !== "??" || isLocal(pathname) || !isScopedSource(pathname) || records.has(pathname)) continue;
    records.set(pathname, makeRecord(normalizedRoot, { path: pathname }, status, "UNTRACKED_WORKTREE"));
  }

  const localExclusions = [...statuses.entries()]
    .filter(([pathname]) => isLocal(pathname))
    .map(([pathname, status]) => ({ path: pathname, git_worktree_status: status, reason: "LOCAL: never read, hash, migrate, or commit user/runtime artifacts." }))
    .sort((left, right) => left.path.localeCompare(right.path, "en"));
  const sortedRecords = [...records.values()].sort((left, right) => left.path.localeCompare(right.path, "en"));
  const missingRequiredPaths = requiredPaths.filter((pathname) => !records.has(pathname));
  if (missingRequiredPaths.length > 0) fail(`Required legacy paths missing from manifest: ${missingRequiredPaths.join(", ")}`);
  const headCommit = git(normalizedRoot, ["rev-parse", "HEAD"]).trim();
  const objectFormat = git(normalizedRoot, ["rev-parse", "--show-object-format"]).trim();
  return {
    schema_version: 1,
    manifest_kind: "legacy_source_snapshot",
    observation: {
      generated_at_utc_plus_8: generatedAt,
      legacy_root: normalizedRoot,
      legacy_branch: git(normalizedRoot, ["branch", "--show-current"]).trim(),
      legacy_head_commit: headCommit,
      git_object_format: objectFormat,
      generator_command: "node docs/architecture/generate-legacy-source-manifest.mjs --legacy-root <legacy-root> --output docs/architecture/legacy-source-manifest.json --generated-at <UTC+8 ISO-8601>",
      verification_command: "node docs/architecture/generate-legacy-source-manifest.mjs --legacy-root <legacy-root> --output docs/architecture/legacy-source-manifest.json --verify",
    },
    scope: {
      tracked_roots: scopedRoots,
      related_root_source_pattern: rootSourcePattern.source,
      local_exclusion_rules: ["Settings.xml", "**/imgui.ini", "Builds/**", "**/node_modules/**", "tools/last_imported_build.xml", "**/*.cfg", "**/*.exe", "**/*.dll"],
      required_paths: requiredPaths,
    },
    records: sortedRecords,
    local_exclusions: localExclusions,
    summary: {
      tracked_head_records: sortedRecords.filter((record) => record.source === "TRACKED_HEAD").length,
      untracked_worktree_records: sortedRecords.filter((record) => record.source === "UNTRACKED_WORKTREE").length,
      missing_worktree_records: sortedRecords.filter((record) => record.worktree_state === "MISSING").length,
      local_exclusion_records: localExclusions.length,
    },
  };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const output = resolve(options.output);
  if (!output.startsWith(`${repositoryRoot}${sep}`)) fail("Manifest output must remain inside the new repository.");
  const existing = options.verify ? JSON.parse(readFileSync(output, "utf8")) : null;
  const generatedAt = options.generatedAt ?? existing.observation.generated_at_utc_plus_8;
  const manifest = buildManifest(options.legacyRoot, generatedAt);
  if (options.verify) {
    if (JSON.stringify(existing) !== JSON.stringify(manifest)) fail("Manifest differs from the reproducible legacy snapshot.");
    console.log(`LEGACY_MANIFEST_VERIFY_OK records=${manifest.records.length} local_exclusions=${manifest.local_exclusions.length}`);
    return;
  }
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`LEGACY_MANIFEST_WRITE_OK records=${manifest.records.length} local_exclusions=${manifest.local_exclusions.length}`);
}

main();
