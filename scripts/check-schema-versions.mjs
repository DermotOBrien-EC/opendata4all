import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const currentSchemaVersion = "0.1.0";
const schemasDir = "schemas";
const examplesDir = "examples";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(path) {
  const text = readFileSync(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} must be valid JSON: ${error.message}`);
  }
}

function jsonFilesIn(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(directory, entry.name))
    .sort();
}

function jsonlFilesIn(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => join(directory, entry.name))
    .sort();
}

function examplePackageDirs() {
  return readdirSync(examplesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(examplesDir, entry.name))
    .filter((directory) => existsSync(join(directory, "metadata", "manifest.json")))
    .sort();
}

function assertSupportedSchemaVersion(path, value) {
  assert(
    value?.schema_version === currentSchemaVersion,
    `${path} schema_version must be ${currentSchemaVersion}`,
  );
}

function checkSchemaFiles() {
  const schemaPaths = readdirSync(schemasDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".schema.json"))
    .map((entry) => join(schemasDir, entry.name))
    .sort();

  assert(schemaPaths.length > 0, "schemas/*.schema.json files are required");

  for (const schemaPath of schemaPaths) {
    const schema = readJson(schemaPath);
    const schemaVersionConst = schema?.properties?.schema_version?.const;
    assert(
      schemaVersionConst === currentSchemaVersion,
      `${schemaPath} root properties.schema_version.const must be ${currentSchemaVersion}`,
    );
  }
}

function checkJsonlRows(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0) {
      continue;
    }

    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error(`${path}:${index + 1} must be valid JSON: ${error.message}`);
    }

    assertSupportedSchemaVersion(`${path}:${index + 1}`, row);
  }
}

function checkExamplePackages() {
  const packageDirs = examplePackageDirs();
  assert(packageDirs.length > 0, "checked-in example packages are required");

  for (const packageDir of packageDirs) {
    assertSupportedSchemaVersion(join(packageDir, "metadata", "manifest.json"), readJson(join(packageDir, "metadata", "manifest.json")));

    for (const receiptPath of jsonFilesIn(join(packageDir, "receipts"))) {
      assertSupportedSchemaVersion(receiptPath, readJson(receiptPath));
    }

    for (const reportPath of jsonFilesIn(join(packageDir, "reports"))) {
      assertSupportedSchemaVersion(reportPath, readJson(reportPath));
    }

    for (const jsonlPath of jsonlFilesIn(join(packageDir, "data", "jsonl"))) {
      checkJsonlRows(jsonlPath);
    }
  }
}

checkSchemaFiles();
checkExamplePackages();

console.log("Schema version validation: passed");
