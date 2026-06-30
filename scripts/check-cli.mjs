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
  const jsonl = '{"id":1}\n{"id":2}\n';

  const help = runCli(["help"]);
  assert(help.status === 0, "help command should succeed");
  for (const command of ["init", "import", "export", "inspect", "validate"]) {
    assert(help.stdout.includes(`od4a ${command}`), `help should list ${command}`);
  }

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
    "import should preserve valid JSONL records",
  );

  const exportedStdout = runCli(["export", packageDir]);
  assert(exportedStdout.status === 0, "stdout export should succeed");
  assert(exportedStdout.stdout === jsonl, "stdout export should match imported JSONL");

  const exportedFile = runCli(["export", packageDir, exportPath]);
  assert(exportedFile.status === 0, "file export should succeed");
  assert((await readFile(exportPath, "utf8")) === jsonl, "file export should match imported JSONL");

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
