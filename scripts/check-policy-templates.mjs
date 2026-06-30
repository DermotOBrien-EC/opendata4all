import { readFileSync } from "node:fs";

const templates = [
  {
    path: "docs/controlled-access-policy-template.md",
    label: "controlled-access policy template",
    title: "# Controlled Access Policy Template",
    requiredPlaceholders: [
      "[PACKAGE_ID]",
      "[STEWARD_NAME]",
      "[PRIVACY_CONTACT]",
      "[SHA256_MANIFEST_HASH]",
      "[CONSENT_RECEIPT_REFERENCES]",
      "[REDACTION_REPORT_REFERENCES]",
      "[INCIDENT_REPORTING_WINDOW]",
      "[DELETION_WINDOW]",
      "[ACCESS_APPLICATION_ID]",
      "[APPROVED | DENIED | MORE_INFORMATION_NEEDED]",
      "[REVIEWERS]",
      { value: "[YYYY-MM-DD]", count: 2 },
      "[FIELDS_OR_FILES]",
      "[PURPOSE]",
      "[CONDITIONS]",
    ],
    requiredPhrases: [
      "not legal advice",
      "controlled_research",
      "secure_enclave",
      "tier_4_quarantine",
      "must not",
      "Attempt re-identification",
      "Redistribute record-level data",
      "Train or fine-tune public models",
      "takedown",
      "withdrawal",
      "deletion attestation",
      "Publication",
      "manifest hash",
      "consent receipt",
      "redaction report",
    ],
  },
  {
    path: "docs/data-use-agreement-template.md",
    label: "data-use agreement template",
    title: "# Data Use Agreement Template",
    requiredPlaceholders: [
      "[STEWARD_NAME]",
      "[RECIPIENT_INSTITUTION]",
      "[NAMED_USERS]",
      "[PRIVACY_CONTACT]",
      "[SECURITY_CONTACT]",
      "[PACKAGE_ID]",
      "[VERSION]",
      "[SHA256_MANIFEST_HASH]",
      "[FILES_OR_FIELDS]",
      "[CONSENT_RECEIPTS]",
      "[REDACTION_REPORTS]",
      "[SPECIFIC_RESEARCH_PURPOSE]",
      "[INCIDENT_REPORTING_WINDOW]",
      "[RETENTION_DEADLINE]",
      "[EXPIRY_DATE]",
    ],
    requiredPhrases: [
      "not legal advice",
      "controlled_research",
      "secure_enclave",
      "Manifest hash",
      "Consent receipt",
      "Redaction report",
      "Prohibited Uses",
      "Attempt re-identification",
      "Redistribute",
      "Train, fine-tune, distill",
      "Security Controls",
      "Retention And Deletion",
      "deletion attestation",
      "Publication Review",
      "Termination",
    ],
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function placeholderRequirement(value) {
  return typeof value === "string" ? { value, count: 1 } : value;
}

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

for (const template of templates) {
  const text = readFileSync(template.path, "utf8");
  const normalizedText = text.replace(/\s+/g, " ");

  assert(
    text.startsWith(`${template.title}\n`),
    `${template.path}: ${template.label} must start with title ${JSON.stringify(template.title)}`,
  );
  assert(!text.includes("TODO"), `${template.path}: ${template.label} must use bracketed placeholders, not TODO`);
  assert(/\[[A-Z0-9_ |]+\]/.test(text), `${template.path}: ${template.label} must include bracketed placeholders`);

  for (const item of template.requiredPlaceholders) {
    const placeholder = placeholderRequirement(item);
    const count = countOccurrences(text, placeholder.value);
    assert(
      count >= placeholder.count,
      `${template.path}: ${template.label} must include placeholder ${placeholder.value} at least ${placeholder.count} time(s)`,
    );
  }

  for (const phrase of template.requiredPhrases) {
    assert(normalizedText.includes(phrase), `${template.path}: ${template.label} missing required phrase "${phrase}"`);
  }
}

console.log(`Validated ${templates.length} controlled-access/data-use templates.`);
