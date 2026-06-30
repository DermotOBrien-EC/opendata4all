#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const args = process.argv.slice(2);
const command = args[0] ?? "help";

function runNodeScript(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

function runNodeScripts(scriptPaths) {
  for (const scriptPath of scriptPaths) {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      stdio: "inherit",
    });

    if (result.error) {
      console.error(result.error.message);
      process.exit(1);
    }

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  process.exit(0);
}

async function initPackage(packageDir) {
  const target = resolve(process.cwd(), packageDir);

  try {
    const entries = await readdir(target);
    if (entries.length > 0) {
      console.error(`Refusing to initialize non-empty directory: ${target}`);
      process.exit(1);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(resolve(target, "data", "jsonl"), { recursive: true });
  await mkdir(resolve(target, "metadata"), { recursive: true });
  await mkdir(resolve(target, "receipts"), { recursive: true });
  await mkdir(resolve(target, "reports"), { recursive: true });
  await mkdir(resolve(target, "signatures"), { recursive: true });

  await writeFile(
    resolve(target, "README.md"),
    [
      "# OD4A Package",
      "",
      "This directory was initialized by od4a init.",
      "It is a local scaffold and does not yet contain a release manifest.",
      "",
    ].join("\n"),
  );

  for (const relativePath of [
    ["data", "jsonl", ".gitkeep"],
    ["metadata", ".gitkeep"],
    ["receipts", ".gitkeep"],
    ["reports", ".gitkeep"],
    ["signatures", ".gitkeep"],
  ]) {
    await writeFile(resolve(target, ...relativePath), "");
  }
}

async function importJsonl(sourcePath, targetDir) {
  const inputPath = resolve(process.cwd(), sourcePath);
  const packageRoot = resolve(process.cwd(), targetDir);
  const destinationPath = resolve(packageRoot, "data", "jsonl", "events.jsonl");

  let contents;
  try {
    contents = await readFile(inputPath, "utf8");
  } catch (error) {
    console.error(`Unable to read input JSONL at ${inputPath}`);
    console.error(error.message);
    process.exit(1);
  }

  const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    console.error("Input JSONL is empty");
    process.exit(1);
  }

  for (const [index, line] of lines.entries()) {
    try {
      JSON.parse(line);
    } catch (error) {
      console.error(`Invalid JSON on line ${index + 1} of ${inputPath}`);
      console.error(error.message);
      process.exit(1);
    }
  }

  await mkdir(resolve(packageRoot, "data", "jsonl"), { recursive: true });
  await writeFile(destinationPath, `${lines.join("\n")}\n`);

  console.log(`Imported ${lines.length} JSONL records to ${destinationPath}`);
}

async function exportJsonl(packageDir, outputPath) {
  const sourcePath = resolve(process.cwd(), packageDir, "data", "jsonl", "events.jsonl");

  let contents;
  try {
    contents = await readFile(sourcePath, "utf8");
  } catch (error) {
    console.error(`Unable to read exported JSONL at ${sourcePath}`);
    console.error(error.message);
    process.exit(1);
  }

  if (outputPath) {
    const destinationPath = resolve(process.cwd(), outputPath);
    await writeFile(destinationPath, contents);
    console.log(`Exported JSONL to ${destinationPath}`);
    return;
  }

  process.stdout.write(contents);
}

async function inspectPackage(packageDir) {
  const manifestPath = resolve(process.cwd(), packageDir, "metadata", "manifest.json");

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    console.error(`Unable to read manifest at ${manifestPath}`);
    console.error(error.message);
    process.exit(1);
  }

  const fileCount = Array.isArray(manifest.files) ? manifest.files.length : 0;
  const consentCount = Array.isArray(manifest.consent_receipts) ? manifest.consent_receipts.length : 0;
  const reportCount = Array.isArray(manifest.redaction_reports) ? manifest.redaction_reports.length : 0;

  console.log(`Package: ${manifest.package_id ?? "(unknown)"}`);
  console.log(`Version: ${manifest.version ?? "(unknown)"}`);
  console.log(`Release tier: ${manifest.release_tier ?? "(unknown)"}`);
  console.log(`Schema version: ${manifest.schema_version ?? "(unknown)"}`);
  console.log(`Files: ${fileCount}`);
  console.log(`Consent receipts: ${consentCount}`);
  console.log(`Redaction reports: ${reportCount}`);
  console.log(`Validation: ${manifest.validation?.status ?? "(unknown)"}`);
}

function printHelp() {
  console.log(`opendata4all

Usage:
  od4a init [package-dir]
  od4a import <source-jsonl> [package-dir]
  od4a export [package-dir] [output-jsonl]
  od4a validate
  od4a validate-schemas
  od4a validate-examples
  od4a inspect [package-dir]
  od4a help

Current commands are intentionally narrow. The initial CLI only performs local
package scaffolding, JSONL import/export, validation, and manifest inspection.
`);
}

switch (command) {
  case "init":
    await initPackage(args[1] ?? "od4a-package");
    break;
  case "import":
    if (args.length < 2) {
      console.error("Usage: od4a import <source-jsonl> [package-dir]");
      process.exit(1);
    }
    await importJsonl(args[1], args[2] ?? ".");
    break;
  case "export":
    await exportJsonl(args[1] ?? ".", args[2]);
    break;
  case "validate":
    runNodeScripts([
      resolve(root, "scripts", "check-schemas.mjs"),
      resolve(root, "scripts", "check-examples.mjs"),
    ]);
    break;
  case "validate-schemas":
    runNodeScript(resolve(root, "scripts", "check-schemas.mjs"));
    break;
  case "validate-examples":
    runNodeScript(resolve(root, "scripts", "check-examples.mjs"));
    break;
  case "inspect":
    await inspectPackage(args[1] ?? ".");
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
