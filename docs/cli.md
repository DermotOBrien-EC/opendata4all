# CLI

The initial `od4a` command is intentionally narrow. It exists to expose the
project's validation surface before any adapter or packaging workflow is added.

## Commands

- `od4a validate`
- `od4a validate-schemas`
- `od4a validate-examples`
- `od4a init [package-dir]`
- `od4a import <source-jsonl> [package-dir]`
- `od4a export [package-dir] [output-jsonl]`
- `od4a scan [package-dir]`
- `od4a report [package-dir] [output-json]`
- `od4a preview [package-dir]`
- `od4a validate-package [package-dir]`
- `od4a consent-draft [package-dir] [output-json]`
- `od4a inspect [package-dir]`
- `od4a help`

## Behavior

- `validate` runs schema and checked-in example validation locally.
- `init` creates a local package scaffold with package subdirectories and
  placeholder files.
- `import` validates and copies a local JSONL source file into a package data
  directory.
- `export` copies the canonical JSONL file back out to stdout or a local file.
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
- `inspect` reads an OD4A package manifest from the current directory or a
  relative package directory and prints a summary without opening any network
  connection.
- The initial CLI does not publish, upload, or connect to external services.
- All output should remain free of raw donated data.
- Future commands such as `redact` and `package` will build on the same
  local-first contract.
