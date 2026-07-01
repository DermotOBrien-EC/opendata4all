# Validation

Validation is an evidence system, not proof that a dataset is safe.

The MVP validation command is dependency-free:

```bash
npm run validate
```

It checks that all schema files parse as JSON, that the current privacy and
governance invariants remain represented in the schemas, that schema files and
checked-in package artifacts stay on the supported schema version, that checked-in
example packages are internally consistent, that the local CLI commands keep
working against checked-in adapter fixtures and disposable packages, that
repository text files do not contain unallowlisted live-looking credentials, and
that repository package and CI policy still enforce private, dependency-free
validation. It also checks that controlled-access policy and data-use agreement
templates keep required donor-protection guardrails.

The CI workflow runs the same command on pull requests and pushes to `main`.
The workflow does not require dependency installation because the CLI and
validation scripts use only the Node.js standard library.

## Current Schema Invariants

- Consent receipts require source adapters with names and versions.
- Consent receipts require source, time, data-class, purpose, recipient,
  retention, withdrawal, and status fields.
- Consent receipt source, data-class, and purpose scopes require non-empty
  string values; recipient classes must use the supported schema vocabulary.
- Fixed-range consent requires non-null `from` and `to`.
- Rolling consent requires an explicit expiry or bounded range.
- One-time consent binds to an exact package manifest hash.
- Fixed-period retention requires a non-null expiry.
- Non-draft consent requires an actionable withdrawal path.
- Package manifests require source adapters with names and versions.
- Controlled, public, and reproducibility releases cannot include raw-data files.
- Controlled, public, and reproducibility releases must reference consent
  receipts and redaction reports.
- Schema definitions and checked-in example package artifacts must use the
  current supported `schema_version` value, `0.1.0`.
- Local Hugging Face sample generation and public Hugging Face publishing must
  fail closed unless the package is a public release with passed validation,
  active consent, publishable redaction reports, current checksums, and
  `contains_raw_data: false` declared for every copied file. Public publishing
  additionally requires an explicit `--yes` plus a token supplied through the
  environment; dry-runs must perform the same package gates without network
  access.
- Local derived table generation must preserve canonical event row counts while
  excluding raw message text and tool command strings from table and sidecar
  output.
- Local derived table schema sidecars must declare `raw_data_included: false`
  and describe derived metric columns such as text counts and tool-command
  presence without storing raw values.
- Local redaction must refuse non-empty output directories, leave the source
  package unchanged, remove raw text/tool command strings and deterministic risk
  matches from output JSONL, write only raw-value-free reports and command
  output, mark redacted JSONL as non-raw-capable for later manifests, and fail
  closed if high-risk deterministic findings remain.
- OpenAI API app-log, Codex hook, and Claude Code hook adapter imports must keep
  passing against checked-in synthetic JSONL fixtures, including privacy canaries
  that prove private transcript paths, environment values, working directories,
  and Claude Code tool input file paths are not copied into normalized events.
- Checked-in distributable example validation must cover every manifest-bearing
  package directory under `examples/`, include `public_release`,
  `controlled_research`, and `reproducibility_snapshot` tiers, and keep those
  packages internally consistent, including current hashes, explicit
  `contains_raw_data: false`, unique event IDs within each JSONL file, matching
  adapter metadata, active consent receipts, and README safety posture text that
  names the package ID, release tier, synthetic status, no-real-donated-data
  status, no-secrets status, and no-private-export status. Public-release and
  reproducibility snapshot redaction reports must be `publishable`; controlled
  research reports must be `controlled_only` or `publishable`.
- Checked-in redaction canary fixtures must keep exercising every current
  deterministic detector label: OpenAI-style tokens, AWS access keys, GitHub
  classic tokens, GitHub fine-grained tokens, private-key headers, environment
  assignments, email addresses, IP addresses, full URLs, and local file paths.
  CLI checks must prove raw matched values are not echoed in scan, preview,
  package validation, manifest, or report output.
- Repository secret scanning must fail on unallowlisted live-looking OpenAI,
  AWS, classic GitHub, fine-grained GitHub, and PEM private-key credentials
  while printing only path, line, and detector label context. Allowlisted
  token/private-key-looking matches are limited to exact synthetic redaction
  canary fixture values at exact paths, and every allowlisted detector tuple must
  be observed during the scan.
- Repository policy validation must keep `package.json` private and
  dependency-free, ensure every local validation gate remains wired into
  `npm run validate`, and ensure CI runs validation without install or
  dependency-cache assumptions.

## Current Template Invariants

- Controlled-access policy and data-use agreement templates must keep their
  expected top-level titles and role-critical bracketed placeholders for package
  identifiers, steward and privacy contacts, manifest hashes, consent receipts,
  redaction reports, recipients, security contacts, research purpose, incidents,
  retention, and expiry or review deadlines as applicable.
- Controlled-access policy and data-use agreement templates must warn that they
  are not legal advice.
- Controlled-access policy and data-use agreement templates must cover
  `controlled_research`, `secure_enclave`, manifest hashes, consent receipts,
  and redaction reports.
- Controlled-access policy and data-use agreement templates must include
  restrictions on re-identification, redistribution, public model training or
  fine-tuning, takedowns or termination, withdrawal or retention, deletion
  attestation, security controls, and publication review.

## Later Validation

Later milestones should add full JSON Schema instance validation, additional
edge-case example fixtures, broader migration-compatibility coverage, broader
redaction policy matrices, broader scanning policy checks, and signed release
checks.
