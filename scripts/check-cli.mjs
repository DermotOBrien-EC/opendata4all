import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliPath = resolve(root, "bin", "od4a.mjs");

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

async function main() {
  const workDir = await mkdtemp(join(tmpdir(), "od4a-cli-"));
  const packageDir = join(workDir, "package");
  const sourcePath = join(workDir, "records.jsonl");
  const exportPath = join(workDir, "exported.jsonl");
  const jsonl = '{"id":1}\r\n\r\n{"id":2}\r\n';

  const help = runCli(["help"]);
  assert(help.status === 0, "help command should succeed");
  for (const command of [
    "init",
    "import",
    "export",
    "inspect",
    "preview",
    "report",
    "scan",
    "validate",
    "validate-package",
  ]) {
    assert(help.stdout.includes(`od4a ${command}`), `help should list ${command}`);
  }

  const validateSchemas = runCli(["validate-schemas"]);
  assert(validateSchemas.status === 0, "validate-schemas command should succeed");

  const validateExamples = runCli(["validate-examples"]);
  assert(validateExamples.status === 0, "validate-examples command should succeed");

  const validate = runCli(["validate"]);
  assert(validate.status === 0, "validate command should succeed");
  assert(validate.stdout.includes("Validated 4 schema files."), "validate should run schema checks");
  assert(validate.stdout.includes("Validated 1 example package."), "validate should run example checks");
  assert(
    !validate.stdout.includes("Validated od4a CLI commands."),
    "od4a validate must not recursively invoke CLI regression checks",
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

  const fakeSecret = "sk-abcdefghijklmnopqrstuvwxyz0123456789AB";
  const secretReportPath = join(workDir, "secret-redaction-report.json");
  await writeFile(sourcePath, `${JSON.stringify({ text: fakeSecret })}\n`);
  const secretImport = runCli(["import", sourcePath, packageDir]);
  assert(secretImport.status === 0, "import should accept valid JSONL with high-risk text");

  const secretScan = runCli(["scan"], { cwd: packageDir });
  assert(secretScan.status === 2, "scan should fail closed when high-risk secrets are found");
  assert(secretScan.stdout.includes("secret.openai_api_key"), "scan should report the detector label");
  assert(!secretScan.stdout.includes(fakeSecret), "scan output must not echo detected secret values");

  const secretPreview = runCli(["preview", packageDir]);
  assert(secretPreview.status === 0, "preview should summarize high-risk packages");
  assert(secretPreview.stdout.includes("Decision: blocked"), "preview should include blocked decisions");
  assert(secretPreview.stdout.includes("secret.openai_api_key"), "preview should include detector labels");
  assert(!secretPreview.stdout.includes(fakeSecret), "preview must not echo detected secret values");

  const secretPackageValidation = runCli(["validate-package", packageDir]);
  assert(secretPackageValidation.status === 2, "validate-package should fail closed on high-risk findings");
  assert(secretPackageValidation.stdout.includes("Package validation: failed"), "high-risk package should fail");
  assert(secretPackageValidation.stdout.includes("Decision: blocked"), "high-risk package should be blocked");
  assert(!secretPackageValidation.stdout.includes(fakeSecret), "package validation must not echo secret values");

  const secretReport = runCli(["report", packageDir, secretReportPath]);
  assert(secretReport.status === 0, "report should write high-risk redaction reports");
  assert(!secretReport.stdout.includes(fakeSecret), "report output must not echo detected secret values");
  const parsedSecretReport = JSON.parse(await readFile(secretReportPath, "utf8"));
  assert(parsedSecretReport.decision === "blocked", "high-risk report should be blocked");
  assert(parsedSecretReport.summary.blocked_findings === 1, "high-risk report should count blocked findings");
  assert(JSON.stringify(parsedSecretReport).includes("secret.openai_api_key"), "report should include detector class");
  assert(!JSON.stringify(parsedSecretReport).includes(fakeSecret), "report must not include raw secret values");

  const fakeEmail = "donor@example.com";
  const fakeUrl = "https://example.com/private/path?case=123";
  const fakePath = "/Users/example/private-note.txt";
  await writeFile(
    sourcePath,
    `${JSON.stringify({ text: "plain first record" })}\r\n\r\n${JSON.stringify({
      email: fakeEmail,
      url: fakeUrl,
      path: fakePath,
      ip: "192.0.2.10",
    })}\r\n`,
  );
  const piiImport = runCli(["import", sourcePath, packageDir]);
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
  for (const rawValue of [fakeEmail, fakeUrl, fakePath, "192.0.2.10"]) {
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
  for (const rawValue of [fakeEmail, fakeUrl, fakePath, "192.0.2.10"]) {
    assert(!piiPreview.stdout.includes(rawValue), "preview must not echo personal or private values");
  }

  const piiPackageValidation = runCli(["validate-package"], { cwd: packageDir });
  assert(piiPackageValidation.status === 0, "validate-package should not fail closed on medium-risk findings");
  assert(piiPackageValidation.stdout.includes("Package validation: passed"), "medium-risk package should pass gate");
  assert(piiPackageValidation.stdout.includes("Decision: review_required"), "medium-risk package should require review");
  for (const rawValue of [fakeEmail, fakeUrl, fakePath, "192.0.2.10"]) {
    assert(!piiPackageValidation.stdout.includes(rawValue), "package validation must not echo personal values");
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
  for (const rawValue of [fakeEmail, fakeUrl, fakePath, "192.0.2.10"]) {
    assert(!JSON.stringify(parsedPiiReport).includes(rawValue), "report must not include raw personal values");
  }

  await mkdir(join(packageDir, "metadata"), { recursive: true });
  await writeFile(
    join(packageDir, "metadata", "manifest.json"),
    `${JSON.stringify({
      package_id: "od4a-cli-check",
      version: "0.1.0",
      release_tier: "local_review",
      schema_version: "0.1.0",
      files: [{ path: "data/jsonl/events.jsonl" }],
      consent_receipts: [],
      redaction_reports: [],
      validation: { status: "draft" },
    })}\n`,
  );

  const inspected = runCli(["inspect"], { cwd: packageDir });
  assert(inspected.status === 0, "inspect should succeed from a package directory");
  assert(inspected.stdout.includes("Package: od4a-cli-check"), "inspect should summarize package id");

  await writeFile(sourcePath, '{"id":1}\nnot json\n');
  const invalidImport = runCli(["import", sourcePath, packageDir]);
  assert(invalidImport.status !== 0, "import should reject invalid JSONL");

  await rm(workDir, { recursive: true, force: true });

  console.log("Validated od4a CLI commands.");
}

await main();
