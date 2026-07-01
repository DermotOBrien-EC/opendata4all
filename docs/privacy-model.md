# Privacy Model

AI interaction logs are high-risk by default. They may contain personal data,
third-party personal data, special-category data, credentials, source code,
private files, employer material, copyrighted text, and uniquely identifying
narratives.

## Core Rules

- No hidden capture.
- No automatic upload.
- Public Hugging Face publishing requires an explicit command, public-release
  package gates, an active consent receipt, and a user-supplied token.
- No public raw transcripts.
- Local redaction and preview before upload.
- `od4a redact` is a local package transform only. It removes or replaces raw
  text and tool command strings, but it does not make a legal anonymity claim
  and does not authorize publication by itself.
- Redacted data is risk-reduced, not automatically anonymous.
- Pseudonymized data remains personal data when re-identification is reasonably
  possible.
- Public release must be treated as practically hard to revoke from downstream
  copies.

## Data Classes

The product should distinguish:

- Data about the donor.
- Data about third parties.
- Employer, institutional, client, confidential, copyrighted, or proprietary
  data.
- Special-category or sensitive data.
- Secrets and credentials.
- Data suitable for public release after redaction.
- Data that requires controlled research access.
- Data that must stay quarantined or be deleted.

## Red Lines

Do not collect or publish by default:

- IP addresses or hashed IP addresses.
- Request headers, cookies, OAuth tokens, API keys, private keys, or session
  identifiers.
- Precise timestamps, exact locations, full URLs, local file paths, repo names,
  or user-agent strings.
- Clipboard contents, key events, dwell time, screen telemetry, browser history,
  or background app activity.
- Hidden system prompts or private platform instructions.
- Attachments, screenshots, or source files unless explicitly scoped and
  reviewed.

## High-Risk Release Handling

High-risk records should be routed to `controlled_research`,
`secure_enclave`, or `quarantine`, not public release.

Examples:

- Special-category or sensitive personal data.
- Third-party personal data that cannot be safely redacted.
- Live secrets or credential material.
- Employer or client material.
- Malware, exploit chains, fraud workflows, or other operational abuse content.
- Benchmark answers or evaluation contamination.
- Highly identifying narratives.

## Legal Baseline

The project is designed to support GDPR-style requirements: purpose limitation,
data minimization, storage limitation, integrity and confidentiality,
accountability, rights handling, and documented consent. Legal review is still
required before accepting real donations.
