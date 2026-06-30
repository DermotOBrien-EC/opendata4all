# Validation

Validation is an evidence system, not proof that a dataset is safe.

The MVP validation command is dependency-free:

```bash
npm run validate
```

It checks that all schema files parse as JSON, that the current privacy and
governance invariants remain represented in the schemas, that checked-in
example packages are internally consistent, that the local CLI commands keep
working against checked-in adapter fixtures and disposable packages, that
repository text files do not contain unallowlisted live-looking credentials, and
that controlled-access policy templates keep required donor-protection
guardrails.

The CI workflow runs the same command on pull requests and pushes to `main`.
The workflow does not require dependency installation because the CLI and
validation scripts use only the Node.js standard library.

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
- Local Hugging Face sample generation must fail closed unless the package is a
  public release with passed validation, active consent, publishable redaction
  reports, current checksums, and `contains_raw_data: false` declared for every
  copied file.
- Local derived table generation must preserve canonical event row counts while
  excluding raw message text and tool command strings from table and sidecar
  output.
- Local derived table schema sidecars must declare `raw_data_included: false`
  and describe derived metric columns such as text counts and tool-command
  presence without storing raw values.
- OpenAI API app-log, Codex hook, and Claude Code hook adapter imports must keep
  passing against checked-in synthetic JSONL fixtures, including privacy canaries
  that prove private transcript paths, environment values, working directories,
  and Claude Code tool input file paths are not copied into normalized events.
- Checked-in public-safe example packages must remain internally consistent,
  including current hashes, explicit `contains_raw_data: false`, unique event
  IDs within each JSONL file, matching adapter metadata, active consent receipts,
  and publishable redaction reports.
- Checked-in redaction canary fixtures must keep exercising every current
  deterministic detector label: OpenAI-style tokens, AWS access keys, GitHub
  tokens, private-key headers, environment assignments, email addresses, IP
  addresses, full URLs, and local file paths. CLI checks must prove raw matched
  values are not echoed in scan, preview, package validation, manifest, or
  report output.
- Repository secret scanning must fail on unallowlisted live-looking OpenAI,
  AWS, GitHub, and PEM private-key credentials while printing only path, line,
  and detector label context. Allowlisted token/private-key-looking matches are
  limited to exact synthetic redaction canary fixture values at exact paths.

## Current Template Invariants

- Controlled-access templates must warn that they are not legal advice.
- Controlled-access templates must cover `controlled_research`,
  `secure_enclave`, quarantine, manifest hashes, consent receipts, and
  redaction reports.
- Controlled-access templates must include restrictions on re-identification,
  redistribution, public model training or fine-tuning, takedowns, withdrawal,
  deletion attestation, security controls, and publication review.

## Later Validation

Later milestones should add full JSON Schema instance validation, broader
example fixtures, schema migration tests, broader redaction policy matrices,
dependency and scanning policy checks, and signed release checks.
