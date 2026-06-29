# Architecture

opendata4all uses a local-first architecture. The user controls what is scanned,
what is redacted, what is previewed, and what is packaged before any network
upload can happen.

## Pipeline

```text
adapter
  -> local encrypted staging
  -> normalize to OD4A events
  -> classify and score risk
  -> redact locally
  -> preview package
  -> record consent receipt
  -> build release package
  -> optional controlled upload
```

## Canonical Data Model

The canonical data model is an append-only event log. Each record is an
`org.opendata4all.interaction_event` with a stable envelope and typed payload.

Derived views, such as transcript tables or Parquet analytics files, must be
generated from the canonical log and release manifest. They are not the source
of truth.

## Major Components

- `core`: schema definitions, event normalization, manifests, validation, and
  release-tier rules.
- `adapters`: source-specific importers that read only through documented,
  user-authorized surfaces.
- `redaction`: local scanners, transformation plans, risk scoring, and redaction
  reports.
- `preview`: local-only package review UI or report generation.
- `packaging`: JSONL, Parquet, manifests, checksums, signatures, and metadata
  exports.
- `governance`: consent receipts, takedown records, release review status, and
  access-tier metadata.

## Trust Boundaries

- Source app/export to adapter.
- Adapter to local staging store.
- Raw staging to redacted artifact.
- Redacted artifact to preview.
- Previewed artifact to consent receipt.
- Consented package to upload queue.
- Upload queue to controlled access or publication system.

Each boundary should produce audit metadata: software version, policy version,
input and output hashes, detector versions, user decision, and release tier.

## Default Release Tiers

- `raw_vault`: encrypted intake, never distributed.
- `local_review`: local bundle for preview and correction.
- `controlled_research`: redacted or pseudonymized records under a data use
  agreement.
- `public_release`: low-risk, consent-compatible records, aggregates, labels,
  examples, or synthetic data.
- `reproducibility_snapshot`: immutable research snapshot with exact manifest,
  version, and citation metadata.

## Standards Strategy

opendata4all keeps a small internal model and maps to standards at boundaries:

- OpenTelemetry for runtime spans and trace correlation.
- OpenInference export where AI tracing tools need it.
- CloudEvents for durable domain events.
- W3C PROV for release provenance snapshots.
- DCAT for catalog metadata.
- Frictionless Data Package for tabular package descriptors.
- Croissant for ML-ready dataset metadata.
- RO-Crate for archival research bundles.
- DPV terms for privacy, processing, and consent vocabularies.

No external standard should force raw prompts, tool results, file paths, or
personal data into general telemetry.
