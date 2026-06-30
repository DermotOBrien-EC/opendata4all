import { readFileSync } from "node:fs";

const templates = [
  {
    path: "docs/controlled-access-policy-template.md",
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

for (const template of templates) {
  const text = readFileSync(template.path, "utf8");
  const normalizedText = text.replace(/\s+/g, " ");

  assert(!text.includes("TODO"), `${template.path}: template must use bracketed placeholders, not TODO`);
  assert(/\[[A-Z0-9_ |]+\]/.test(text), `${template.path}: template must include bracketed placeholders`);

  for (const phrase of template.requiredPhrases) {
    assert(normalizedText.includes(phrase), `${template.path}: missing required phrase "${phrase}"`);
  }
}

console.log(`Validated ${templates.length} controlled-access policy templates.`);
