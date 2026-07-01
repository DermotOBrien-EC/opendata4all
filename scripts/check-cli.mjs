import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliPath = resolve(root, "bin", "od4a.mjs");
const adapterFixturesDir = join(root, "examples", "adapter-fixtures");
const openAiApiFixturePath = join(adapterFixturesDir, "openai-api-app-log.jsonl");
const codexHookFixturePath = join(adapterFixturesDir, "codex-hook.jsonl");
const claudeCodeHookFixturePath = join(adapterFixturesDir, "claude-code-hook.jsonl");
const redactionCanariesDir = join(root, "examples", "redaction-canaries");
const highRiskSecretCanaryPath = join(redactionCanariesDir, "high-risk-secret.jsonl");
const highRiskAwsAccessKeyCanaryPath = join(redactionCanariesDir, "high-risk-aws-access-key.jsonl");
const highRiskGithubTokenCanaryPath = join(redactionCanariesDir, "high-risk-github-token.jsonl");
const highRiskGithubFineGrainedTokenCanaryPath = join(
  redactionCanariesDir,
  "high-risk-github-fine-grained-token.jsonl",
);
const highRiskPrivateKeyCanaryPath = join(redactionCanariesDir, "high-risk-private-key.jsonl");
const mediumRiskPersonalCanaryPath = join(redactionCanariesDir, "medium-risk-personal.jsonl");
const mediumRiskEnvAssignmentCanaryPath = join(redactionCanariesDir, "medium-risk-env-assignment.jsonl");
const highRiskRedactionCanaries = [
  {
    name: "openai-api-key",
    path: highRiskSecretCanaryPath,
    labels: ["secret.openai_api_key"],
  },
  {
    name: "aws-access-key",
    path: highRiskAwsAccessKeyCanaryPath,
    labels: ["secret.aws_access_key"],
  },
  {
    name: "github-token",
    path: highRiskGithubTokenCanaryPath,
    labels: ["secret.github_token"],
  },
  {
    name: "github-fine-grained-token",
    path: highRiskGithubFineGrainedTokenCanaryPath,
    labels: ["secret.github_fine_grained_token"],
  },
  {
    name: "private-key",
    path: highRiskPrivateKeyCanaryPath,
    labels: ["secret.private_key"],
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? root,
    encoding: "utf8",
  });
}

function sha256Hex(contents) {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

async function readJsonlFixture(fixturePath) {
  const text = await readFile(fixturePath, "utf8");
  const records = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));

  assert(records.length > 0, `${fixturePath} must contain at least one JSONL record`);
  return records;
}

function stringValues(value) {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => stringValues(item));
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => stringValues(item));
  }

  return [];
}

function assertNoRawValues(text, rawValues, message) {
  for (const rawValue of rawValues) {
    assert(!text.includes(rawValue), message);
  }
}

async function assertHighRiskRedactionCanary({ canary, packageDir, reportPath }) {
  const records = await readJsonlFixture(canary.path);
  const rawValues = records.flatMap((record) => stringValues(record));
  assert(rawValues.length > 0, `${canary.path} must contain raw canary string values`);

  const imported = runCli(["import", canary.path, packageDir]);
  assert(imported.status === 0, `${canary.name} import should accept valid high-risk JSONL`);

  const scan = runCli(["scan"], { cwd: packageDir });
  assert(scan.status === 2, `${canary.name} scan should fail closed when high-risk secrets are found`);
  for (const label of canary.labels) {
    assert(scan.stdout.includes(label), `${canary.name} scan should report ${label}`);
  }
  assertNoRawValues(scan.stdout, rawValues, `${canary.name} scan output must not echo detected values`);

  const preview = runCli(["preview", packageDir]);
  assert(preview.status === 0, `${canary.name} preview should summarize high-risk packages`);
  assert(preview.stdout.includes("Decision: blocked"), `${canary.name} preview should include blocked decisions`);
  for (const label of canary.labels) {
    assert(preview.stdout.includes(label), `${canary.name} preview should include ${label}`);
  }
  assertNoRawValues(preview.stdout, rawValues, `${canary.name} preview must not echo detected values`);

  const packageValidation = runCli(["validate-package", packageDir]);
  assert(packageValidation.status === 2, `${canary.name} validate-package should fail closed on high-risk findings`);
  assert(packageValidation.stdout.includes("Package validation: failed"), `${canary.name} package should fail`);
  assert(packageValidation.stdout.includes("Decision: blocked"), `${canary.name} package should be blocked`);
  assertNoRawValues(packageValidation.stdout, rawValues, `${canary.name} package validation must not echo values`);

  const manifest = runCli(["manifest", packageDir]);
  assert(manifest.status === 0, `${canary.name} manifest should write local review manifests for high-risk packages`);
  assert(manifest.stdout.includes("Validation: failed"), `${canary.name} manifest should report failed validation`);
  assertNoRawValues(manifest.stdout, rawValues, `${canary.name} manifest output must not echo values`);
  const parsedManifest = JSON.parse(await readFile(join(packageDir, "metadata", "manifest.json"), "utf8"));
  assert(parsedManifest.validation.status === "failed", `${canary.name} manifest should record failed validation`);
  assert(
    parsedManifest.validation.notes.includes("blocked finding"),
    `${canary.name} manifest should explain blocked findings without raw values`,
  );
  assertNoRawValues(
    JSON.stringify(parsedManifest),
    rawValues,
    `${canary.name} generated manifest must not include raw values`,
  );

  const report = runCli(["report", packageDir, reportPath]);
  assert(report.status === 0, `${canary.name} report should write high-risk redaction reports`);
  assertNoRawValues(report.stdout, rawValues, `${canary.name} report output must not echo detected values`);
  const parsedReport = JSON.parse(await readFile(reportPath, "utf8"));
  assert(parsedReport.decision === "blocked", `${canary.name} report should be blocked`);
  assert(
    parsedReport.summary.blocked_findings === canary.labels.length,
    `${canary.name} report should count blocked findings`,
  );
  for (const label of canary.labels) {
    assert(JSON.stringify(parsedReport).includes(label), `${canary.name} report should include ${label}`);
  }
  assertNoRawValues(JSON.stringify(parsedReport), rawValues, `${canary.name} report must not include raw values`);
}

async function main() {
  const workDir = await mkdtemp(join(tmpdir(), "od4a-cli-"));
  const packageDir = join(workDir, "package");
  const openAiPackageDir = join(workDir, "openai-package");
  const derivedTablesDir = join(workDir, "derived-tables");
  const hfSampleDir = join(workDir, "hf-sample");
  const blockedHfSampleDir = join(workDir, "blocked-hf-sample");
  const missingRawFlagPackageDir = join(workDir, "missing-raw-flag-package");
  const missingRawFlagHfSampleDir = join(workDir, "missing-raw-flag-hf-sample");
  const codexPackageDir = join(workDir, "codex-package");
  const codexDerivedTablesDir = join(workDir, "codex-derived-tables");
  const claudePackageDir = join(workDir, "claude-package");
  const sourcePath = join(workDir, "records.jsonl");
  const exportPath = join(workDir, "exported.jsonl");
  const jsonl = '{"id":1}\r\n\r\n{"id":2}\r\n';

  const help = runCli(["help"]);
  assert(help.status === 0, "help command should succeed");
  for (const command of [
    "consent-draft",
    "dataset-card",
    "derive-tables",
    "init",
    "import",
    "import-claude-code-hook",
    "import-codex-hook",
    "import-openai-api",
    "manifest",
    "export",
    "hf-sample",
    "inspect",
    "preview",
    "report",
    "scan",
    "validate",
    "validate-consent",
    "validate-examples",
    "validate-package",
    "validate-schemas",
    "validate-templates",
    "validate-versions",
    "withdraw-consent",
  ]) {
    assert(help.stdout.includes(`od4a ${command}`), `help should list ${command}`);
  }

  const validateSchemas = runCli(["validate-schemas"]);
  assert(validateSchemas.status === 0, "validate-schemas command should succeed");

  const validateVersions = runCli(["validate-versions"]);
  assert(validateVersions.status === 0, "validate-versions command should succeed");
  assert(
    validateVersions.stdout.includes("Schema version validation: passed"),
    "validate-versions should run schema version checks",
  );

  const validateExamples = runCli(["validate-examples"]);
  assert(validateExamples.status === 0, "validate-examples command should succeed");

  const validateTemplates = runCli(["validate-templates"]);
  assert(validateTemplates.status === 0, "validate-templates command should succeed");
  assert(
    validateTemplates.stdout.includes("Validated 2 controlled-access/data-use templates."),
    "validate-templates should run controlled-access/data-use template checks",
  );

  const validate = runCli(["validate"]);
  assert(validate.status === 0, "validate command should succeed");
  assert(validate.stdout.includes("Validated 4 schema files."), "validate should run schema checks");
  assert(
    validate.stdout.includes("Schema version validation: passed"),
    "validate should run schema version checks",
  );
  assert(validate.stdout.includes("Validated 4 example packages."), "validate should run example checks");
  assert(
    !validate.stdout.includes("Validated od4a CLI commands."),
    "od4a validate must not recursively invoke CLI regression checks",
  );
  assert(
    !validate.stdout.includes("Validated 2 controlled-access/data-use templates."),
    "od4a validate must not run template checks",
  );

  const init = runCli(["init", packageDir]);
  assert(init.status === 0, "init command should succeed");

  for (const relativePath of [
    "README.md",
    "data/jsonl/.gitkeep",
    "metadata/.gitkeep",
    "receipts/.gitkeep",
    "reports/.gitkeep",
    "signatures/.gitkeep",
  ]) {
    await readFile(join(packageDir, relativePath), "utf8");
  }

  const initAgain = runCli(["init", packageDir]);
  assert(initAgain.status !== 0, "init should reject non-empty directories");

  await writeFile(sourcePath, jsonl);
  const imported = runCli(["import", sourcePath, packageDir]);
  assert(imported.status === 0, "import command should succeed");
  assert(
    (await readFile(join(packageDir, "data", "jsonl", "events.jsonl"), "utf8")) === jsonl,
    "import should preserve original JSONL bytes",
  );

  const cleanScan = runCli(["scan", packageDir]);
  assert(cleanScan.status === 0, "scan should pass clean JSONL");
  assert(cleanScan.stdout.includes("Findings: 0"), "scan should report zero findings");

  const cleanPackageValidation = runCli(["validate-package", packageDir]);
  assert(cleanPackageValidation.status === 0, "validate-package should pass clean JSONL");
  assert(
    cleanPackageValidation.stdout.includes("Package validation: passed"),
    "clean package validation should pass",
  );

  const exportedStdout = runCli(["export", packageDir]);
  assert(exportedStdout.status === 0, "stdout export should succeed");
  assert(exportedStdout.stdout === jsonl, "stdout export should match imported JSONL");

  const exportedFile = runCli(["export", packageDir, exportPath]);
  assert(exportedFile.status === 0, "file export should succeed");
  assert((await readFile(exportPath, "utf8")) === jsonl, "file export should match imported JSONL");

  const openAiImport = runCli(["import-openai-api", openAiApiFixturePath, openAiPackageDir]);
  assert(openAiImport.status === 0, "import-openai-api command should succeed");
  const openAiEventsPath = join(openAiPackageDir, "data", "jsonl", "events.jsonl");
  const openAiEventText = await readFile(openAiEventsPath, "utf8");
  const openAiEvents = openAiEventText
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert(openAiEvents.length === 6, "import-openai-api should normalize input and output messages");
  assert(
    new Set(openAiEvents.map((event) => event.event_id)).size === openAiEvents.length,
    "duplicate OpenAI API log records should still produce unique event IDs",
  );
  assert(
    openAiEvents.every((event) => event.source.adapter_name === "od4a-openai-api-app-log"),
    "OpenAI API events should identify the source adapter",
  );
  assert(
    openAiEvents.every((event) => event.source.capture_method === "manual_import"),
    "OpenAI API events should use manual_import capture method",
  );
  assert(
    openAiEvents.every((event) => event.provenance.trust_level === "user_supplied"),
    "OpenAI API events should mark app-side logs as user-supplied",
  );
  assert(
    openAiEvents.every((event) => /^sha256:[a-f0-9]{64}$/.test(event.provenance.raw_source_hash)),
    "OpenAI API events should carry per-source-line hashes",
  );
  assert(openAiEvents[0].actor.type === "user", "OpenAI API user messages should map to user actor type");
  assert(openAiEvents[1].actor.type === "assistant", "OpenAI API assistant messages should map to assistant actor type");
  assert(
    openAiEvents[2].data.parts[0].text === "What should adapters avoid?",
    "OpenAI API input fields should normalize to user text parts",
  );
  assert(
    openAiEvents[3].data.parts[0].text === "Private app internals and undocumented storage.",
    "OpenAI API output_text fields should normalize to assistant text parts",
  );
  const openAiScan = runCli(["scan", openAiPackageDir]);
  assert(openAiScan.status === 0, "scan should accept normalized OpenAI API events");
  const openAiManifest = runCli(["manifest", openAiPackageDir]);
  assert(openAiManifest.status === 0, "manifest command should succeed");
  assert(openAiManifest.stdout.includes("Release tier: local_review"), "manifest should summarize local review tier");
  const parsedOpenAiManifest = JSON.parse(await readFile(join(openAiPackageDir, "metadata", "manifest.json"), "utf8"));
  const openAiManifestFile = parsedOpenAiManifest.files.find((file) => file.path === "data/jsonl/events.jsonl");
  assert(parsedOpenAiManifest.release_tier === "local_review", "generated manifests should default to local review");
  assert(parsedOpenAiManifest.validation.status === "passed", "clean generated manifests should pass local validation");
  assert(
    parsedOpenAiManifest.source_adapters.some((adapter) => adapter.name === "od4a-openai-api-app-log"),
    "generated manifests should infer source adapter metadata from OD4A events",
  );
  assert(openAiManifestFile.sha256 === sha256Hex(openAiEventText), "generated manifests should include file checksum");
  assert(
    openAiManifestFile.bytes === Buffer.byteLength(openAiEventText),
    "generated manifests should include file byte count",
  );
  assert(openAiManifestFile.row_count === openAiEvents.length, "generated manifests should include JSONL row count");
  assert(openAiManifestFile.contains_raw_data === true, "generated local review manifests should fail closed on raw data");
  const openAiDatasetCard = runCli(["dataset-card", openAiPackageDir]);
  assert(openAiDatasetCard.status === 0, "dataset-card command should succeed");
  assert(openAiDatasetCard.stdout.includes("Release tier: local_review"), "dataset-card should summarize release tier");
  const openAiCardText = await readFile(join(openAiPackageDir, "metadata", "dataset-card.md"), "utf8");
  assert(openAiCardText.includes("# od4a-openai-package"), "dataset-card should include package id");
  assert(openAiCardText.includes("od4a-openai-api-app-log"), "dataset-card should include source adapter metadata");
  assert(openAiCardText.includes("Files marked as raw data: 1"), "dataset-card should summarize raw file count");
  assert(openAiCardText.includes("Local review only"), "dataset-card should warn about local-review packages");
  for (const rawValue of [
    "Summarize consent requirements.",
    "Use explicit, revocable consent.",
    "Private app internals and undocumented storage.",
  ]) {
    assert(!openAiCardText.includes(rawValue), "dataset-card must not include raw event text");
  }

  const derivedTables = runCli(["derive-tables", openAiPackageDir, derivedTablesDir]);
  assert(derivedTables.status === 0, "derive-tables command should succeed");
  assert(derivedTables.stdout.includes("Schema:"), "derive-tables should summarize the schema sidecar");
  assert(derivedTables.stdout.includes("Raw text included: no"), "derive-tables should summarize raw-text policy");
  const derivedEventText = await readFile(join(derivedTablesDir, "events.jsonl"), "utf8");
  const derivedEventSchemaText = await readFile(join(derivedTablesDir, "events.schema.json"), "utf8");
  const derivedEventSchema = JSON.parse(derivedEventSchemaText);
  const derivedEventRows = derivedEventText
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const derivedColumnNames = derivedEventSchema.columns.map((column) => column.name);
  assert(derivedEventRows.length === openAiEvents.length, "derive-tables should preserve event row count");
  assert(derivedEventSchema.table === "events", "derive-tables should write the event table schema");
  assert(derivedEventSchema.row_count === openAiEvents.length, "derived table schema should record row count");
  assert(derivedEventSchema.raw_data_included === false, "derived table schema should declare raw-data exclusion");
  assert(
    derivedColumnNames.includes("text_char_count") && derivedColumnNames.includes("has_tool_command"),
    "derived table schema should describe derived metric columns",
  );
  assert(
    derivedEventRows.every((row) => row.table === "events" && row.schema_version === "0.1.0"),
    "derive-tables should write versioned event table rows",
  );
  assert(
    derivedEventRows.some((row) => row.text_part_count === 1 && row.text_char_count > 0),
    "derive-tables should include text count metrics",
  );
  assert(
    derivedEventRows.every((row) => !("text" in row) && !("command" in row)),
    "derive-tables should not include raw text or command fields",
  );
  for (const rawValue of [
    "Summarize consent requirements.",
    "Use explicit, revocable consent.",
    "Private app internals and undocumented storage.",
  ]) {
    assert(!derivedEventText.includes(rawValue), "derived tables must not include raw event text");
    assert(!derivedEventSchemaText.includes(rawValue), "derived table schemas must not include raw event text");
    assert(!derivedTables.stdout.includes(rawValue), "derive-tables output must not echo raw event text");
  }
  const unsafeDerivedTables = runCli(["derive-tables", openAiPackageDir, join(openAiPackageDir, "data", "jsonl")]);
  assert(unsafeDerivedTables.status === 1, "derive-tables should reject output paths that overwrite canonical JSONL");
  assert(
    unsafeDerivedTables.stderr.includes("Refusing to overwrite canonical JSONL"),
    "derive-tables should explain canonical JSONL overwrite rejection",
  );
  assert(
    (await readFile(openAiEventsPath, "utf8")) === openAiEventText,
    "derive-tables overwrite rejection must preserve canonical JSONL bytes",
  );

  const blockedHfSample = runCli(["hf-sample", openAiPackageDir, blockedHfSampleDir]);
  assert(blockedHfSample.status === 1, "hf-sample should reject local-review packages");
  assert(
    blockedHfSample.stdout.includes("release_tier_must_be_public_release"),
    "hf-sample should explain release-tier failures",
  );
  for (const rawValue of [
    "Summarize consent requirements.",
    "Use explicit, revocable consent.",
    "Private app internals and undocumented storage.",
  ]) {
    assert(!blockedHfSample.stdout.includes(rawValue), "hf-sample rejection output must not echo raw event text");
  }

  const hfSample = runCli(["hf-sample", "examples/minimal-package", hfSampleDir]);
  assert(hfSample.status === 0, "hf-sample should materialize public-safe examples");
  assert(hfSample.stdout.includes("Release tier: public_release"), "hf-sample should summarize release tier");
  const hfReadme = await readFile(join(hfSampleDir, "README.md"), "utf8");
  assert(hfReadme.includes("configs:"), "hf-sample README should include Hugging Face data_files config");
  assert(hfReadme.includes('path: "data/jsonl/events.jsonl"'), "hf-sample README should point to JSONL data");
  assert(hfReadme.includes("public-safe"), "hf-sample README should carry public-safe metadata");
  assert(
    !hfReadme.includes("Synthetic prompt for schema validation."),
    "hf-sample README must not include raw event text",
  );
  assert(
    (await readFile(join(hfSampleDir, "data", "jsonl", "events.jsonl"), "utf8")) ===
      (await readFile(join(root, "examples", "minimal-package", "data", "jsonl", "events.jsonl"), "utf8")),
    "hf-sample should copy the package JSONL without changing bytes",
  );
  await readFile(join(hfSampleDir, "metadata", "manifest.json"), "utf8");
  await readFile(join(hfSampleDir, "receipts", "consent-001.json"), "utf8");
  await readFile(join(hfSampleDir, "reports", "redaction-report.json"), "utf8");

  await mkdir(join(missingRawFlagPackageDir, "data", "jsonl"), { recursive: true });
  await mkdir(join(missingRawFlagPackageDir, "metadata"), { recursive: true });
  await mkdir(join(missingRawFlagPackageDir, "receipts"), { recursive: true });
  await mkdir(join(missingRawFlagPackageDir, "reports"), { recursive: true });
  await copyFile(
    join(root, "examples", "minimal-package", "data", "jsonl", "events.jsonl"),
    join(missingRawFlagPackageDir, "data", "jsonl", "events.jsonl"),
  );
  await copyFile(
    join(root, "examples", "minimal-package", "reports", "redaction-report.json"),
    join(missingRawFlagPackageDir, "reports", "redaction-report.json"),
  );
  const missingRawFlagManifest = JSON.parse(
    await readFile(join(root, "examples", "minimal-package", "metadata", "manifest.json"), "utf8"),
  );
  delete missingRawFlagManifest.files[0].contains_raw_data;
  const missingRawFlagManifestText = `${JSON.stringify(missingRawFlagManifest, null, 2)}\n`;
  const missingRawFlagReceipt = JSON.parse(
    await readFile(join(root, "examples", "minimal-package", "receipts", "consent-001.json"), "utf8"),
  );
  missingRawFlagReceipt.package_manifest_hash = sha256Hex(missingRawFlagManifestText);
  await writeFile(join(missingRawFlagPackageDir, "metadata", "manifest.json"), missingRawFlagManifestText);
  await writeFile(
    join(missingRawFlagPackageDir, "receipts", "consent-001.json"),
    `${JSON.stringify(missingRawFlagReceipt, null, 2)}\n`,
  );
  const missingRawFlagHfSample = runCli(["hf-sample", missingRawFlagPackageDir, missingRawFlagHfSampleDir]);
  assert(missingRawFlagHfSample.status === 1, "hf-sample should reject files without explicit raw-data flags");
  assert(
    missingRawFlagHfSample.stdout.includes("contains_raw_data_false_required:data/jsonl/events.jsonl"),
    "hf-sample should require explicit contains_raw_data false for copied files",
  );

  const privateTranscriptPath = "/Users/example/.codex/private/transcript.jsonl";
  const privateEnvValue = "synthetic-openai-env-canary";
  const codexImport = runCli(["import-codex-hook", codexHookFixturePath, codexPackageDir]);
  assert(codexImport.status === 0, "import-codex-hook command should succeed");
  const codexEventText = await readFile(join(codexPackageDir, "data", "jsonl", "events.jsonl"), "utf8");
  const codexEvents = codexEventText
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert(codexEvents.length === 3, "import-codex-hook should normalize message and tool hook records");
  assert(
    new Set(codexEvents.map((event) => event.event_id)).size === codexEvents.length,
    "duplicate Codex hook records should still produce unique event IDs",
  );
  assert(
    codexEvents.every((event) => event.source.adapter_name === "od4a-codex-hook"),
    "Codex hook events should identify the source adapter",
  );
  assert(
    codexEvents.every((event) => event.source.capture_method === "documented_hook"),
    "Codex hook events should use documented_hook capture method",
  );
  assert(codexEvents[0].actor.type === "user", "Codex prompt hooks should map to user actor type");
  assert(codexEvents[1].actor.type === "tool", "Codex tool hooks should map to tool actor type");
  assert(codexEvents[1].data.command === "npm run validate", "Codex tool hooks should preserve scoped command text");
  for (const excludedValue of [privateTranscriptPath, privateEnvValue, "/Users/example/private/repo"]) {
    assert(!codexEventText.includes(excludedValue), "Codex hook import should not copy private hook metadata");
  }
  const codexScan = runCli(["scan", codexPackageDir]);
  assert(codexScan.status === 0, "scan should accept normalized Codex hook events");
  const codexDerivedTables = runCli(["derive-tables", codexPackageDir, codexDerivedTablesDir]);
  assert(codexDerivedTables.status === 0, "derive-tables should accept command-bearing Codex hook events");
  const codexDerivedEventText = await readFile(join(codexDerivedTablesDir, "events.jsonl"), "utf8");
  const codexDerivedRows = codexDerivedEventText
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert(codexDerivedRows.length === codexEvents.length, "derive-tables should preserve Codex hook row count");
  assert(
    codexDerivedRows.some(
      (row) => row.data_kind === "tool_event" && row.actor_type === "tool" && row.has_tool_command === true,
    ),
    "derive-tables should project command-bearing tool metadata",
  );
  assert(
    codexDerivedRows.every((row) => !("command" in row)),
    "derive-tables should not include command fields for command-bearing rows",
  );
  assert(!codexDerivedEventText.includes("npm run validate"), "derived tables must not include tool command text");
  assert(!codexDerivedTables.stdout.includes("npm run validate"), "derive-tables output must not echo tool command text");

  const privateClaudeTranscriptPath = "/Users/example/.claude/private/transcript.jsonl";
  const privateClaudeEnvValue = "synthetic-anthropic-env-canary";
  const privateClaudePath = "/Users/example/private/claude-repo";
  const claudeImport = runCli(["import-claude-code-hook", claudeCodeHookFixturePath, claudePackageDir]);
  assert(claudeImport.status === 0, "import-claude-code-hook command should succeed");
  const claudeEventText = await readFile(join(claudePackageDir, "data", "jsonl", "events.jsonl"), "utf8");
  const claudeEvents = claudeEventText
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert(claudeEvents.length === 3, "import-claude-code-hook should normalize message and tool hook records");
  assert(
    new Set(claudeEvents.map((event) => event.event_id)).size === claudeEvents.length,
    "duplicate Claude Code hook records should still produce unique event IDs",
  );
  assert(
    claudeEvents.every((event) => event.source.adapter_name === "od4a-claude-code-hook"),
    "Claude Code hook events should identify the source adapter",
  );
  assert(
    claudeEvents.every((event) => event.source.capture_method === "documented_hook"),
    "Claude Code hook events should use documented_hook capture method",
  );
  assert(claudeEvents[0].actor.type === "user", "Claude Code prompt hooks should map to user actor type");
  assert(claudeEvents[1].actor.type === "tool", "Claude Code tool hooks should map to tool actor type");
  assert(
    claudeEvents[1].data.command === "npm run validate",
    "Claude Code tool hooks should preserve scoped command text",
  );
  for (const excludedValue of [
    privateClaudeTranscriptPath,
    privateClaudeEnvValue,
    privateClaudePath,
    "/Users/example/private/secret.ts",
  ]) {
    assert(!claudeEventText.includes(excludedValue), "Claude Code hook import should not copy private hook metadata");
  }
  const claudeScan = runCli(["scan", claudePackageDir]);
  assert(claudeScan.status === 0, "scan should accept normalized Claude Code hook events");

  for (const canary of highRiskRedactionCanaries) {
    await assertHighRiskRedactionCanary({
      canary,
      packageDir,
      reportPath: join(workDir, `${canary.name}-redaction-report.json`),
    });
  }

  const piiCanaryRecords = await readJsonlFixture(mediumRiskPersonalCanaryPath);
  const piiCanary = piiCanaryRecords[1];
  assert(piiCanary, "medium-risk personal canary fixture must include a second JSONL record");
  const fakeEmail = piiCanary.email;
  const fakeUrl = piiCanary.url;
  const fakePath = piiCanary.path;
  const fakeIp = piiCanary.ip;
  const piiImport = runCli(["import", mediumRiskPersonalCanaryPath, packageDir]);
  assert(piiImport.status === 0, "import should accept valid JSONL with personal data");

  const piiScan = runCli(["scan", packageDir]);
  assert(piiScan.status === 0, "medium-risk scan findings should not fail closed");
  for (const label of [
    "personal.email",
    "personal.ip_address",
    "private.full_url",
    "private.local_file_path",
  ]) {
    assert(piiScan.stdout.includes(label), `scan should report ${label}`);
  }
  assert(piiScan.stdout.includes("line 3: personal.email"), "scan should report physical JSONL line numbers");
  for (const rawValue of [fakeEmail, fakeUrl, fakePath, fakeIp]) {
    assert(!piiScan.stdout.includes(rawValue), "scan output must not echo personal or private values");
  }

  const piiPreview = runCli(["preview"], { cwd: packageDir });
  assert(piiPreview.status === 0, "preview should summarize medium-risk packages");
  assert(piiPreview.stdout.includes("Decision: review_required"), "preview should include review decisions");
  for (const label of [
    "personal.email",
    "personal.ip_address",
    "private.full_url",
    "private.local_file_path",
  ]) {
    assert(piiPreview.stdout.includes(label), `preview should include ${label}`);
  }
  for (const rawValue of [fakeEmail, fakeUrl, fakePath, fakeIp]) {
    assert(!piiPreview.stdout.includes(rawValue), "preview must not echo personal or private values");
  }

  const piiPackageValidation = runCli(["validate-package"], { cwd: packageDir });
  assert(piiPackageValidation.status === 0, "validate-package should not fail closed on medium-risk findings");
  assert(piiPackageValidation.stdout.includes("Package validation: passed"), "medium-risk package should pass gate");
  assert(piiPackageValidation.stdout.includes("Decision: review_required"), "medium-risk package should require review");
  for (const rawValue of [fakeEmail, fakeUrl, fakePath, fakeIp]) {
    assert(!piiPackageValidation.stdout.includes(rawValue), "package validation must not echo personal values");
  }

  const piiManifest = runCli(["manifest", packageDir]);
  assert(piiManifest.status === 0, "manifest should write local review manifests for medium-risk packages");
  assert(piiManifest.stdout.includes("Validation: passed"), "manifest should pass medium-risk packages");
  for (const rawValue of [fakeEmail, fakeUrl, fakePath, fakeIp]) {
    assert(!piiManifest.stdout.includes(rawValue), "manifest output must not echo personal values");
  }
  const parsedPiiManifest = JSON.parse(await readFile(join(packageDir, "metadata", "manifest.json"), "utf8"));
  assert(parsedPiiManifest.validation.status === "passed", "medium-risk generated manifests should pass validation");
  for (const rawValue of [fakeEmail, fakeUrl, fakePath, fakeIp]) {
    assert(!JSON.stringify(parsedPiiManifest).includes(rawValue), "generated manifests must not include personal values");
  }

  const piiReport = runCli(["report", packageDir]);
  assert(piiReport.status === 0, "report should write medium-risk redaction reports");
  assert(piiReport.stdout.includes("Decision: review_required"), "report should summarize review decisions");
  const parsedPiiReport = JSON.parse(await readFile(join(packageDir, "reports", "redaction-report.json"), "utf8"));
  assert(parsedPiiReport.schema_version === "0.1.0", "report should declare schema version");
  assert(/^sha256:[a-f0-9]{64}$/.test(parsedPiiReport.input_hash), "report should include input hash");
  assert(/^sha256:[a-f0-9]{64}$/.test(parsedPiiReport.output_hash), "report should include output hash");
  assert(parsedPiiReport.decision === "review_required", "medium-risk report should require review");
  assert(parsedPiiReport.summary.blocked_findings === 0, "medium-risk report should not count blocked findings");
  assert(parsedPiiReport.summary.redacted_findings === 0, "scan report should not claim redaction");
  for (const label of [
    "personal.email",
    "personal.ip_address",
    "private.full_url",
    "private.local_file_path",
  ]) {
    assert(JSON.stringify(parsedPiiReport).includes(label), `report should include ${label}`);
  }
  for (const rawValue of [fakeEmail, fakeUrl, fakePath, fakeIp]) {
    assert(!JSON.stringify(parsedPiiReport).includes(rawValue), "report must not include raw personal values");
  }

  const envCanaryRecords = await readJsonlFixture(mediumRiskEnvAssignmentCanaryPath);
  const envRawValues = envCanaryRecords.flatMap((record) => stringValues(record));
  const envImport = runCli(["import", mediumRiskEnvAssignmentCanaryPath, packageDir]);
  assert(envImport.status === 0, "import should accept valid JSONL with env-assignment canary text");

  const envScan = runCli(["scan", packageDir]);
  assert(envScan.status === 0, "env-assignment scan findings should not fail closed");
  assert(envScan.stdout.includes("secret.env_assignment"), "scan should report secret.env_assignment");
  assertNoRawValues(envScan.stdout, envRawValues, "scan output must not echo env-assignment values");

  const envPreview = runCli(["preview"], { cwd: packageDir });
  assert(envPreview.status === 0, "preview should summarize env-assignment packages");
  assert(envPreview.stdout.includes("Decision: review_required"), "preview should include review decisions");
  assert(envPreview.stdout.includes("secret.env_assignment"), "preview should include secret.env_assignment");
  assertNoRawValues(envPreview.stdout, envRawValues, "preview must not echo env-assignment values");

  const envPackageValidation = runCli(["validate-package"], { cwd: packageDir });
  assert(envPackageValidation.status === 0, "validate-package should not fail closed on env-assignment findings");
  assert(envPackageValidation.stdout.includes("Package validation: passed"), "env-assignment package should pass gate");
  assert(
    envPackageValidation.stdout.includes("Decision: review_required"),
    "env-assignment package should require review",
  );
  assertNoRawValues(
    envPackageValidation.stdout,
    envRawValues,
    "package validation must not echo env-assignment values",
  );

  const envManifest = runCli(["manifest", packageDir]);
  assert(envManifest.status === 0, "manifest should write local review manifests for env-assignment packages");
  assert(envManifest.stdout.includes("Validation: passed"), "manifest should pass env-assignment packages");
  assertNoRawValues(envManifest.stdout, envRawValues, "manifest output must not echo env-assignment values");
  const parsedEnvManifest = JSON.parse(await readFile(join(packageDir, "metadata", "manifest.json"), "utf8"));
  assert(parsedEnvManifest.validation.status === "passed", "env-assignment generated manifests should pass validation");
  assertNoRawValues(
    JSON.stringify(parsedEnvManifest),
    envRawValues,
    "generated manifests must not include env-assignment values",
  );

  const envReport = runCli(["report", packageDir]);
  assert(envReport.status === 0, "report should write env-assignment redaction reports");
  assert(envReport.stdout.includes("Decision: review_required"), "env-assignment report should summarize decisions");
  assertNoRawValues(envReport.stdout, envRawValues, "report output must not echo env-assignment values");
  const parsedEnvReport = JSON.parse(await readFile(join(packageDir, "reports", "redaction-report.json"), "utf8"));
  assert(parsedEnvReport.decision === "review_required", "env-assignment report should require review");
  assert(parsedEnvReport.summary.blocked_findings === 0, "env-assignment report should not count blocked findings");
  assert(parsedEnvReport.summary.redacted_findings === 0, "env-assignment report should not claim redaction");
  assert(JSON.stringify(parsedEnvReport).includes("secret.env_assignment"), "report should include secret.env_assignment");
  assertNoRawValues(
    JSON.stringify(parsedEnvReport),
    envRawValues,
    "report must not include raw env-assignment values",
  );

  await mkdir(join(packageDir, "metadata"), { recursive: true });
  const manifestJson = `${JSON.stringify({
    package_id: "od4a-cli-check",
    version: "0.1.0",
    release_tier: "local_review",
    schema_version: "0.1.0",
    publisher: {
      name: "OD4A CLI test steward",
      contact: "privacy@example.invalid",
    },
    source_adapters: [
      {
        name: "od4a-cli-check",
        version: "0.1.0",
        capture_method: "manual_import",
      },
    ],
    files: [{ path: "data/jsonl/events.jsonl" }],
    consent_receipts: [],
    redaction_reports: [],
    validation: { status: "draft" },
  })}\n`;
  await writeFile(join(packageDir, "metadata", "manifest.json"), manifestJson);

  const inspected = runCli(["inspect"], { cwd: packageDir });
  assert(inspected.status === 0, "inspect should succeed from a package directory");
  assert(inspected.stdout.includes("Package: od4a-cli-check"), "inspect should summarize package id");

  const consentDraft = runCli(["consent-draft"], { cwd: packageDir });
  assert(consentDraft.status === 0, "consent-draft should write draft receipts");
  assert(consentDraft.stdout.includes("Status: draft"), "consent-draft should not activate consent");
  const parsedConsentDraft = JSON.parse(await readFile(join(packageDir, "receipts", "consent-draft.json"), "utf8"));
  assert(parsedConsentDraft.status === "draft", "generated consent receipt must remain draft");
  assert(
    parsedConsentDraft.package_manifest_hash === sha256Hex(manifestJson),
    "generated consent receipt should bind the exact manifest hash",
  );
  assert(
    parsedConsentDraft.source_scope.time_scope.mode === "one_time",
    "generated consent receipt should scope draft consent to one package",
  );
  assert(
    parsedConsentDraft.source_scope.adapters[0].name === "od4a-cli-check",
    "generated consent receipt should carry manifest adapter metadata",
  );
  assert(
    !("url" in parsedConsentDraft.withdrawal) && !("email" in parsedConsentDraft.withdrawal),
    "draft consent receipt should not invent an actionable withdrawal path",
  );

  const consentValidation = runCli(["validate-consent", "receipts/consent-draft.json", "."], { cwd: packageDir });
  assert(consentValidation.status === 0, "validate-consent should pass generated draft receipts");
  assert(consentValidation.stdout.includes("Consent validation: passed"), "valid consent draft should pass");

  const malformedScopeConsent = {
    ...parsedConsentDraft,
    source_scope: {
      ...parsedConsentDraft.source_scope,
      sources: [parsedConsentDraft.source_scope.sources[0], ""],
    },
    data_classes: [parsedConsentDraft.data_classes[0], 42],
    purposes: [parsedConsentDraft.purposes[0], " "],
    recipient_classes: [parsedConsentDraft.recipient_classes[0], "unsupported_recipient_class"],
  };
  await writeFile(
    join(packageDir, "receipts", "malformed-scope-consent.json"),
    `${JSON.stringify(malformedScopeConsent)}\n`,
  );
  const malformedScopeValidation = runCli(["validate-consent", "receipts/malformed-scope-consent.json", "."], {
    cwd: packageDir,
  });
  assert(malformedScopeValidation.status === 1, "validate-consent should reject malformed scope arrays");
  for (const issue of [
    "source_scope.sources_values_required",
    "data_classes_values_required",
    "purposes_values_required",
    "recipient_classes_invalid",
  ]) {
    assert(malformedScopeValidation.stdout.includes(issue), `validate-consent should report ${issue}`);
  }

  const wrongHashConsent = {
    ...parsedConsentDraft,
    package_manifest_hash: `sha256:${"0".repeat(64)}`,
  };
  await writeFile(join(packageDir, "receipts", "wrong-hash-consent.json"), `${JSON.stringify(wrongHashConsent)}\n`);
  const wrongHashValidation = runCli(["validate-consent", "receipts/wrong-hash-consent.json", "."], {
    cwd: packageDir,
  });
  assert(wrongHashValidation.status === 1, "validate-consent should reject manifest hash mismatches");
  assert(
    wrongHashValidation.stdout.includes("package_manifest_hash_mismatch"),
    "validate-consent should report manifest hash mismatch",
  );

  const activeWithoutWithdrawalPath = {
    ...parsedConsentDraft,
    status: "active",
  };
  await writeFile(
    join(packageDir, "receipts", "active-missing-withdrawal.json"),
    `${JSON.stringify(activeWithoutWithdrawalPath)}\n`,
  );
  const activeWithdrawalValidation = runCli(
    ["validate-consent", "receipts/active-missing-withdrawal.json", "."],
    {
      cwd: packageDir,
    },
  );
  assert(activeWithdrawalValidation.status === 1, "validate-consent should reject active consent without a path");
  assert(
    activeWithdrawalValidation.stdout.includes("withdrawal_path_required_for_active_consent"),
    "validate-consent should report missing active withdrawal path",
  );

  const draftWithdrawal = runCli(["withdraw-consent", "receipts/consent-draft.json"], { cwd: packageDir });
  assert(draftWithdrawal.status === 1, "withdraw-consent should reject non-active receipts");
  assert(
    draftWithdrawal.stdout.includes("active_status_required_for_withdrawal"),
    "withdraw-consent should require active receipts",
  );

  const activeConsent = {
    ...parsedConsentDraft,
    status: "active",
    withdrawal: {
      method: "email",
      email: "privacy@example.invalid",
    },
  };
  await writeFile(join(packageDir, "receipts", "active-consent.json"), `${JSON.stringify(activeConsent)}\n`);
  const activeConsentValidation = runCli(["validate-consent", "receipts/active-consent.json", "."], {
    cwd: packageDir,
  });
  assert(activeConsentValidation.status === 0, "validate-consent should pass active consent with a withdrawal path");

  const withdrawnPath = join(packageDir, "receipts", "withdrawn-consent.json");
  const withdrawnConsent = runCli(["withdraw-consent", "receipts/active-consent.json", withdrawnPath], {
    cwd: packageDir,
  });
  assert(withdrawnConsent.status === 0, "withdraw-consent should write withdrawn receipts");
  assert(withdrawnConsent.stdout.includes("Status: withdrawn"), "withdraw-consent should summarize withdrawn status");

  const parsedWithdrawnConsent = JSON.parse(await readFile(withdrawnPath, "utf8"));
  assert(parsedWithdrawnConsent.status === "withdrawn", "withdrawn receipt should have withdrawn status");
  assert(parsedWithdrawnConsent.tombstone.previous_status === "active", "withdrawn receipt should record previous status");
  assert(parsedWithdrawnConsent.tombstone.reason_class === "user_withdrawal", "withdrawn receipt should record reason class");
  assert(
    !("note" in parsedWithdrawnConsent.tombstone),
    "withdrawn tombstone should not carry free-form withdrawal reasons",
  );

  const withdrawnValidation = runCli(["validate-consent", "receipts/withdrawn-consent.json", "."], {
    cwd: packageDir,
  });
  assert(withdrawnValidation.status === 0, "validate-consent should pass withdrawn receipts with tombstones");

  await writeFile(sourcePath, '{"id":1}\nnot json\n');
  const invalidImport = runCli(["import", sourcePath, packageDir]);
  assert(invalidImport.status !== 0, "import should reject invalid JSONL");

  await rm(workDir, { recursive: true, force: true });

  console.log("Validated od4a CLI commands.");
}

await main();
