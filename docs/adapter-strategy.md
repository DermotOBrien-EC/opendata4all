# Adapter Strategy

Adapters must use documented, user-authorized surfaces. They must not scrape
private internals, intercept network traffic, collect auth state, or depend on
undocumented local storage as the primary contract.

## Adapter Contract

Each adapter should implement:

- `discover`: describe available user-selected sources.
- `sample`: show a small local preview and detected data classes.
- `extract`: read only scoped records.
- `normalize`: emit OD4A interaction events.
- `classify_hints`: provide source-specific privacy and risk hints.

Adapters must not upload data. Upload is a separate package-level action.

## Claude Code

Preferred surfaces:

- Documented hooks.
- Structured CLI output for controlled runs.
- User-selected transcript import only after local preview.
- MCP proxying for tools owned by the adapter.

Do not scrape the TUI, intercept API traffic, read private auth files, or crawl
historical transcript directories automatically.

## OpenAI Codex And OpenAI API Apps

Preferred surfaces:

- Codex hooks.
- Codex SDK or MCP server mode for orchestrated runs.
- OpenAI API app-side logging of requests, responses, tool calls, webhooks, and
  trace IDs.
- Agents SDK trace metadata where available.

The local CLI prototype includes `od4a import-openai-api <app-log-jsonl>
[package-dir]` for user-owned application logs. It accepts JSONL records with
supported app-side `messages`, `input`, `prompt`, `output`, or `output_text`
fields, then normalizes them into OD4A events for local review. This is not a
cloud export client and does not read provider dashboards, credentials, abuse
logs, or private product storage.

It also includes `od4a import-codex-hook <hook-jsonl> [package-dir]` for
user-owned Codex hook records. The prototype accepts prompt/message and
tool-command JSONL records, preserves only allowlisted interaction fields, and
drops environment values, working directories, transcript paths, and unknown
payload fields by default.

Do not depend on private app or cloud internals, unstable transcript files, or
platform-side abuse-monitoring logs.

## VS Code And Cursor

Preferred surfaces:

- A VS Code-compatible extension that is off by default.
- Explicit user/workspace consent.
- A user-invoked `@opendata4all` participant or tools.
- Documented VS Code file, editor, terminal, telemetry, and webview APIs.
- Optional Copilot OpenTelemetry ingestion when users enable it.

Cursor-specific internals are out of scope unless Cursor publishes a stable API
or grants permission.

## Browser Chat Apps

Preferred surfaces:

- Official user exports.
- Manual paste or file import.
- Per-click visible-content capture only if a browser extension is justified.

Do not collect HAR/network traffic for dataset ingestion, cookies, localStorage,
browsing history, or persistent broad host access.

## Custom Harnesses

Custom harnesses should emit OD4A events directly or export OpenTelemetry traces
that can be mapped into OD4A events. Tool calls, approvals, and side effects
should be explicit records.
