# CLI

The initial `od4a` command is intentionally narrow. It exists to expose the
project's validation surface before any adapter or packaging workflow is added.

## Commands

- `od4a validate`
- `od4a validate-schemas`
- `od4a validate-examples`
- `od4a help`

## Behavior

- Validation runs locally.
- The initial CLI does not publish, upload, or connect to external services.
- All output should remain free of raw donated data.
- Future commands such as `inspect`, `redact`, `preview`, and `package` will
  build on the same local-first contract.
