import { readFileSync } from "node:fs";

const schemaFiles = [
  "schemas/interaction-event.schema.json",
  "schemas/consent-receipt.schema.json",
  "schemas/redaction-report.schema.json",
  "schemas/package-manifest.schema.json",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function json(value) {
  return JSON.stringify(value);
}

function includesRequired(schema, key) {
  return Array.isArray(schema.required) && schema.required.includes(key);
}

function isDraftStatusCondition(rule) {
  return (
    rule?.if?.properties?.status?.const === "draft" &&
    includesRequired(rule.if, "status")
  );
}

function requiresNonEmptyManifestHash(schema) {
  return (
    includesRequired(schema, "package_manifest_hash") &&
    schema.properties?.package_manifest_hash?.type === "string" &&
    schema.properties?.package_manifest_hash?.minLength === 1
  );
}

function requiresWithdrawalPath(schema) {
  const anyOf = schema.properties?.withdrawal?.anyOf;
  return (
    Array.isArray(anyOf) &&
    anyOf.some((branch) => includesRequired(branch, "url")) &&
    anyOf.some((branch) => includesRequired(branch, "email"))
  );
}

function isTerminalConsentStatusCondition(rule) {
  const statuses = rule?.if?.properties?.status?.enum;
  return (
    Array.isArray(statuses) &&
    statuses.includes("withdrawn") &&
    statuses.includes("deleted") &&
    statuses.includes("expired") &&
    statuses.includes("superseded") &&
    includesRequired(rule.if, "status")
  );
}

function requiresTombstoneMetadata(schema) {
  const tombstone = schema.properties?.tombstone;
  return (
    includesRequired(schema, "tombstone") &&
    includesRequired(tombstone, "created_at") &&
    includesRequired(tombstone, "previous_status") &&
    includesRequired(tombstone, "reason_class") &&
    tombstone.properties?.created_at?.type === "string"
  );
}

function isDistributableReleaseCondition(rule) {
  const releaseTiers = rule?.if?.properties?.release_tier?.enum;
  return (
    Array.isArray(releaseTiers) &&
    releaseTiers.includes("controlled_research") &&
    releaseTiers.includes("public_release") &&
    releaseTiers.includes("reproducibility_snapshot") &&
    includesRequired(rule.if, "release_tier")
  );
}

function blocksRawDataFiles(schema) {
  return (
    schema.properties?.files?.items?.properties?.contains_raw_data?.not?.const ===
    true
  );
}

function requiresReleaseReports(schema) {
  return (
    schema.properties?.consent_receipts?.minItems === 1 &&
    schema.properties?.redaction_reports?.minItems === 1
  );
}

function isFixedPeriodRetentionCondition(rule) {
  return (
    rule?.if?.properties?.class?.const === "fixed_period" &&
    includesRequired(rule.if, "class")
  );
}

function requiresNonNullRetentionExpiry(schema) {
  return (
    includesRequired(schema, "expires_at") &&
    schema.properties?.expires_at?.type === "string"
  );
}

function isTimeScopeModeCondition(rule, mode) {
  return (
    rule?.if?.properties?.mode?.const === mode &&
    includesRequired(rule.if, "mode")
  );
}

function requiresNonNullFromTo(schema) {
  return (
    includesRequired(schema, "from") &&
    includesRequired(schema, "to") &&
    schema.properties?.from?.type === "string" &&
    schema.properties?.to?.type === "string"
  );
}

function requiresRollingExpiryOrRange(schema) {
  const anyOf = schema.anyOf;
  return (
    Array.isArray(anyOf) &&
    anyOf.some(
      (branch) =>
        includesRequired(branch, "expires_at") &&
        branch.properties?.expires_at?.type === "string"
    ) &&
    anyOf.some(requiresNonNullFromTo)
  );
}

const schemas = Object.fromEntries(
  schemaFiles.map((path) => [path, readJson(path)])
);

for (const [path, schema] of Object.entries(schemas)) {
  assert(
    schema.$schema === "https://json-schema.org/draft/2020-12/schema",
    `${path}: must use JSON Schema 2020-12`
  );
  assert(schema.type === "object", `${path}: root schema must be an object`);
  assert(
    schema.additionalProperties === false,
    `${path}: root schema must reject undeclared fields`
  );
  assert(
    schema.properties?.schema_version?.const === "0.1.0",
    `${path}: schema_version const must be 0.1.0`
  );
}

const consent = schemas["schemas/consent-receipt.schema.json"];
const manifest = schemas["schemas/package-manifest.schema.json"];

const sourceScope = consent.properties.source_scope;
const timeScope = sourceScope.properties.time_scope;
const retention = consent.properties.retention;
const withdrawal = consent.properties.withdrawal;

assert(
  includesRequired(sourceScope, "sources") &&
    includesRequired(sourceScope, "adapters") &&
    includesRequired(sourceScope, "time_scope"),
  "consent source_scope must require sources, adapters, and time_scope"
);
assert(
  sourceScope.properties.adapters.minItems === 1,
  "consent source_scope.adapters must be non-empty"
);
assert(
  includesRequired(consent.$defs.adapter_metadata, "name") &&
    includesRequired(consent.$defs.adapter_metadata, "version"),
  "consent adapter metadata must require name and version"
);
assert(
  consent.$defs.adapter_metadata.properties.name.minLength === 1 &&
    consent.$defs.adapter_metadata.properties.version.minLength === 1,
  "consent adapter name and version must be non-empty"
);
assert(
  includesRequired(timeScope, "mode"),
  "consent time_scope must require mode"
);

assert(
  timeScope.allOf.some(
    (rule) =>
      isTimeScopeModeCondition(rule, "fixed_range") &&
      requiresNonNullFromTo(rule.then)
  ),
  "fixed_range consent must require non-null from and to"
);

assert(
  timeScope.allOf.some(
    (rule) =>
      isTimeScopeModeCondition(rule, "rolling_with_expiry") &&
      requiresRollingExpiryOrRange(rule.then)
  ),
  "rolling consent must require explicit expiry or bounded range"
);
assert(
  consent.allOf.some(
    (rule) =>
      json(rule.if).includes("one_time") &&
      requiresNonEmptyManifestHash(rule.then)
  ),
  "one_time consent must bind to a package manifest hash"
);
assert(
  includesRequired(consent, "recipient_classes") &&
    consent.properties.recipient_classes.minItems === 1,
  "consent must require recipient_classes"
);
assert(
  consent.allOf.some(
    (rule) => isDraftStatusCondition(rule) && requiresNonEmptyManifestHash(rule.else)
  ),
  "non-draft consent must require a non-empty package_manifest_hash"
);

assert(
  retention.allOf.some(
    (rule) =>
      isFixedPeriodRetentionCondition(rule) &&
      requiresNonNullRetentionExpiry(rule.then)
  ),
  "fixed_period retention must require non-null expires_at"
);
assert(
  withdrawal.properties.method.minLength === 1 &&
    withdrawal.properties.url.minLength === 1 &&
    withdrawal.properties.email.minLength === 1,
  "withdrawal method, url, and email must be non-empty when present"
);
assert(
  includesRequired(consent, "withdrawal") &&
    consent.allOf.some(
      (rule) => isDraftStatusCondition(rule) && requiresWithdrawalPath(rule.else)
    ),
  "non-draft consent must require withdrawal url or email"
);
assert(
  consent.allOf.some(
    (rule) =>
      isTerminalConsentStatusCondition(rule) &&
      requiresTombstoneMetadata(rule.then)
  ),
  "withdrawn/deleted/expired/superseded consent must require tombstone metadata"
);

assert(
  includesRequired(manifest, "source_adapters"),
  "package manifest must require source_adapters"
);
assert(
  manifest.properties.source_adapters.minItems === 1,
  "package manifest source_adapters must be non-empty"
);
assert(
  includesRequired(manifest.$defs.adapter_metadata, "name") &&
    includesRequired(manifest.$defs.adapter_metadata, "version"),
  "package manifest adapter metadata must require name and version"
);
assert(
  manifest.$defs.adapter_metadata.properties.name.minLength === 1 &&
    manifest.$defs.adapter_metadata.properties.version.minLength === 1,
  "package manifest adapter name and version must be non-empty"
);

const distributableRule = manifest.allOf.find(isDistributableReleaseCondition);

assert(
  distributableRule && blocksRawDataFiles(distributableRule.then),
  "distributable package manifests must reject raw-data files"
);
assert(
  distributableRule && requiresReleaseReports(distributableRule.then),
  "distributable package manifests must require consent and redaction reports"
);

console.log(`Validated ${schemaFiles.length} schema files.`);
