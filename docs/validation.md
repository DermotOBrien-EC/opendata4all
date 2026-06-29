# Validation

Validation is an evidence system, not proof that a dataset is safe.

The MVP validation command is dependency-free:

```bash
npm run validate:schemas
```

It checks that all schema files parse as JSON and that the current privacy and
governance invariants remain represented in the schemas.

The CI workflow runs the same command on pull requests and pushes to `main`.
The workflow does not require dependency installation because the validation
script uses only the Node.js standard library.

## Current Schema Invariants

- Consent receipts require source adapters with names and versions.
- Consent receipts require source, time, data-class, purpose, recipient,
  retention, withdrawal, and status fields.
- Fixed-range consent requires non-null `from` and `to`.
- Rolling consent requires an explicit expiry or bounded range.
- One-time consent binds to an exact package manifest hash.
- Fixed-period retention requires a non-null expiry.
- Non-draft consent requires an actionable withdrawal path.
- Package manifests require source adapters with names and versions.
- Controlled, public, and reproducibility releases cannot include raw-data files.
- Controlled, public, and reproducibility releases must reference consent
  receipts and redaction reports.

## Later Validation

Later milestones should add full JSON Schema instance validation, example
fixtures, schema migration tests, redaction canary tests, adapter fixture tests,
dependency scanning, secret scanning, and signed release checks.
