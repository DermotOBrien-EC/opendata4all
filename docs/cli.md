# CLI

The initial `od4a` command is intentionally narrow. It exposes the project's
local validation, packaging, consent, risk review, and first adapter surfaces.

## Commands

- `od4a validate`
- `od4a validate-schemas`
- `od4a validate-examples`
- `od4a init [package-dir]`
- `od4a import <source-jsonl> [package-dir]`
- `od4a import-openai-api <app-log-jsonl> [package-dir]`
- `od4a import-codex-hook <hook-jsonl> [package-dir]`
- `od4a import-claude-code-hook <hook-jsonl> [package-dir]`
- `od4a export [package-dir] [output-jsonl]`
- `od4a manifest [package-dir]`
- `od4a scan [package-dir]`
- `od4a report [package-dir] [output-json]`
- `od4a preview [package-dir]`
- `od4a validate-package [package-dir]`
- `od4a consent-draft [package-dir] [output-json]`
- `od4a validate-consent <receipt-json> [package-dir]`
- `od4a withdraw-consent <receipt-json> [output-json]`
- `od4a inspect [package-dir]`
- `od4a help`

## Behavior

- `validate` runs schema and checked-in example validation locally.
- `init` creates a local package scaffold with package subdirectories and
  placeholder files.
- `import` validates and copies a local JSONL source file into a package data
  directory.
- `import-openai-api` reads user-owned OpenAI API application-side JSONL logs
  and normalizes supported `messages`, `input`, `prompt`, `output`, and
  `output_text` fields into OD4A interaction events. It skips blank JSONL lines,
  rejects records without importable message text, writes local-review events,
  and does not call OpenAI services, inspect credentials, or read private app
  internals.
- `import-codex-hook` reads user-owned Codex hook JSONL and normalizes supported
  prompt/message and tool-command records into OD4A interaction events. It uses
  only allowlisted fields, drops private hook metadata such as environment
  values, working directories, and transcript paths, writes local-review events,
  and does not call external services or inspect private Codex storage.
- `import-claude-code-hook` reads user-owned Claude Code hook JSONL and
  normalizes supported prompt/message and tool-command records into OD4A
  interaction events. It uses only allowlisted fields, drops private hook
  metadata such as environment values, working directories, transcript paths,
  and tool input file paths, writes local-review events, and does not call
  external services or inspect private Claude Code storage.
- `export` copies the canonical JSONL file back out to stdout or a local file.
- `manifest` writes `metadata/manifest.json` for local review. It computes
  file checksums, byte counts, JSONL row counts, source adapter metadata when
  present in OD4A events, consent and redaction report references, and local
  validation status. Generated manifests default to `local_review`, mark the
  canonical JSONL file as containing raw data, and are not publication approval.
- `scan` checks canonical JSONL for deterministic risk patterns such as private
  keys, API tokens, email addresses, IP addresses, full URLs, and local file
  paths. It reports detector labels and physical JSONL line numbers, not raw
  matched values. The command exits with status `2` when high-risk findings are
  present.
- `report` writes a schema-shaped redaction report from the same local scan
  findings. It records hashes, grouped detector classes, counts, and a release
  decision without storing raw matched values.
- `preview` prints a local risk summary with record counts, detector classes,
  counts, and decision state. It does not render raw transcript text or matched
  values.
- `validate-package` runs the local package risk gate. It exits with status `2`
  when unresolved high-risk findings block export, and does not render raw
  transcript text or matched values.
- `consent-draft` writes a draft consent receipt template bound to the exact
  package manifest hash. It does not record active consent.
- `validate-consent` checks consent receipt scope fields and, when a package
  directory is supplied, verifies that `package_manifest_hash` matches the exact
  package manifest bytes.
- `withdraw-consent` writes a withdrawn consent receipt with minimal tombstone
  metadata. It requires an active receipt and does not contact recipients,
  delete external copies, or publish remotely.
- `inspect` reads an OD4A package manifest from the current directory or a
  relative package directory and prints a summary without opening any network
  connection.
- The initial CLI does not publish, upload, or connect to external services.
- All output should remain free of raw donated data.
- Future commands such as `redact` and `package` will build on the same
  local-first contract.
