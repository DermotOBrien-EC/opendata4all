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
- `od4a inspect [package-dir]`
- `od4a help`

## Behavior

- `validate` runs schema and checked-in example validation locally.
- `init` creates a local package scaffold with package subdirectories and
  placeholder files.
- `import` validates and copies a local JSONL source file into a package data
  directory.
- `export` copies the canonical JSONL file back out to stdout or a local file.
- `scan` checks canonical JSONL for deterministic high-risk patterns such as
  private keys and API tokens. It reports detector labels and line numbers, not
  raw matched values. The command exits with status `2` when high-risk findings
  are present.
- `inspect` reads an OD4A package manifest from the current directory or a
  relative package directory and prints a summary without opening any network
  connection.
- The initial CLI does not publish, upload, or connect to external services.
- All output should remain free of raw donated data.
- Future commands such as `redact`, `preview`, and `package` will build on the
  same local-first contract.
