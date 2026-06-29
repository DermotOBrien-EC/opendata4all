#!/usr/bin/env node
import { readFile } from "node:fs/promises";
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

function runCommand(commandArgs) {
  const result = spawnSync("npm", commandArgs, {
    cwd: root,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
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
  od4a validate
  od4a validate-schemas
  od4a validate-examples
  od4a inspect [package-dir]
  od4a help

Current commands are intentionally narrow. The initial CLI only runs local
validation, example checks, and manifest inspection.
`);
}

switch (command) {
  case "validate":
    runCommand(["run", "validate"]);
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
