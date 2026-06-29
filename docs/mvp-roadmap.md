# MVP Roadmap

## M0: Foundation

- Repository license, governance, security, and contribution docs.
- Architecture, privacy, consent, adapter, and package documentation.
- Initial JSON Schemas for events, consent receipts, redaction reports, and
  manifests.
- CI plan for schema validation, secret scanning, linting, and dependency
  checks.

## M1: Local CLI Prototype

- `od4a init`
- `od4a import`
- `od4a inspect`
- `od4a validate`
- Local package directory format.
- JSONL event export.

## M2: Redaction And Preview

- Deterministic secret scanning.
- PII and sensitive-data detectors.
- Redaction report generation.
- Local preview with original/redacted diff.
- Fail-closed validation for unresolved high-risk findings.

## M3: Consent Receipts

- Consent receipt creation.
- Consent scope validation.
- Revocation and tombstone metadata.
- Package hash binding.

## M4: First AI Interaction Adapters

- Generic OD4A JSONL import.
- OpenAI API app-side logging adapter.
- Codex hooks prototype.
- Claude Code hooks prototype.

## M5: Packaging And Publication

- Parquet derived tables.
- Release manifests and checksums.
- Dataset card generation.
- HF-compatible public-safe sample package.
- Controlled-access policy templates.

## Deferrals

- Hosted upload service.
- Browser extension.
- VS Code extension.
- Attachment ingestion.
- Secure enclave.
- Untrusted plugin ecosystem.
- Public row-level releases at scale.
