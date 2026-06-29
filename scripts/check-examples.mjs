import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const examplePackages = ["examples/minimal-package"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function sha256File(path) {
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
  return `sha256:${digest}`;
}

function fileByteLength(path) {
  return readFileSync(path).byteLength;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isSha256Digest(value) {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function hasNamedVersionedAdapter(adapter) {
  return (
    typeof adapter?.name === "string" &&
    adapter.name.length > 0 &&
    typeof adapter?.version === "string" &&
    adapter.version.length > 0
  );
}

for (const packageDir of examplePackages) {
  const manifestPath = join(packageDir, "metadata", "manifest.json");
  const manifest = readJson(manifestPath);
  const manifestHash = sha256File(manifestPath);

  assert(
    Array.isArray(manifest.source_adapters) &&
      manifest.source_adapters.length > 0 &&
      manifest.source_adapters.every(hasNamedVersionedAdapter),
    `${packageDir}: manifest must list named, versioned source adapters`
  );
  assert(
    ["public_release", "controlled_research", "reproducibility_snapshot"].includes(
      manifest.release_tier
    ),
    `${packageDir}: example package must exercise a distributable release tier`
  );
  assert(
    manifest.files.every((file) => file.contains_raw_data !== true),
    `${packageDir}: distributable example must not include raw-data files`
  );
  assert(
    manifest.consent_receipts.length > 0 &&
      manifest.redaction_reports.length > 0,
    `${packageDir}: distributable example must reference consent and redaction reports`
  );

  const consentReceipts = manifest.consent_receipts.map((receiptPath) =>
    readJson(join(packageDir, receiptPath))
  );
  const redactionReports = manifest.redaction_reports.map((reportPath) =>
    readJson(join(packageDir, reportPath))
  );

  for (const receipt of consentReceipts) {
    assert(
      receipt.status === "active",
      `${packageDir}: example consent receipt must be active`
    );
    assert(
      receipt.package_manifest_hash === manifestHash,
      `${packageDir}: active consent receipt must bind to the current manifest hash`
    );
    assert(
      receipt.source_scope.adapters.every(hasNamedVersionedAdapter),
      `${packageDir}: consent receipt must list named, versioned adapters`
    );
    assert(
      receipt.withdrawal.url || receipt.withdrawal.email,
      `${packageDir}: consent receipt must include a withdrawal path`
    );
  }

  for (const report of redactionReports) {
    assert(
      isSha256Digest(report.input_hash) && isSha256Digest(report.output_hash),
      `${packageDir}: redaction report hashes must be sha256:<64 hex>`
    );
    assert(
      manifest.files.some((file) => file.sha256 === report.output_hash),
      `${packageDir}: redaction report output_hash must match a package file hash`
    );
    assert(
      report.decision === "publishable",
      `${packageDir}: public-safe example redaction report must be publishable`
    );
    assert(
      report.summary.blocked_findings === 0,
      `${packageDir}: public-safe example must not have blocked findings`
    );
  }

  for (const file of manifest.files) {
    const filePath = join(packageDir, file.path);

    assert(
      file.sha256 === sha256File(filePath),
      `${packageDir}: ${file.path} sha256 must match file contents`
    );
    assert(
      file.bytes === fileByteLength(filePath),
      `${packageDir}: ${file.path} byte count must match file contents`
    );

    if (file.media_type !== "application/jsonl") {
      continue;
    }

    const events = readJsonl(filePath);
    assert(events.length > 0, `${packageDir}: JSONL files must not be empty`);
    assert(
      file.row_count === events.length,
      `${packageDir}: ${file.path} row_count must match parsed JSONL rows`
    );

    for (const event of events) {
      assert(
        event.schema_version === "0.1.0",
        `${packageDir}: event schema_version must be 0.1.0`
      );
      assert(
        event.consent.status === "granted",
        `${packageDir}: example event must have granted consent`
      );
      assert(
        consentReceipts.some(
          (receipt) => receipt.receipt_id === event.consent.receipt_id
        ),
        `${packageDir}: event consent receipt_id must reference a package receipt`
      );
      assert(
        event.risk.severity !== "blocked",
        `${packageDir}: public-safe example event must not be blocked`
      );
      assert(
        manifest.source_adapters.some(
          (adapter) => adapter.name === event.source.adapter_name
        ),
        `${packageDir}: event adapter must appear in manifest source_adapters`
      );
    }
  }
}

console.log(`Validated ${examplePackages.length} example package.`);
