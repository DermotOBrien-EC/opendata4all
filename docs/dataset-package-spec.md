# Dataset Package Specification

An OD4A package is a directory or archive containing redacted interaction data,
metadata, consent receipts, redaction reports, validation reports, and a signed
release manifest.

## Package Layout

```text
od4a-package/
  data/
    jsonl/
    parquet/
  metadata/
    manifest.json
    dataset-card.md
    dcat.jsonld
    croissant.jsonld
    provenance.prov.json
    ro-crate-metadata.json
  receipts/
    consent-*.json
  reports/
    redaction-report.json
    validation-report.json
  signatures/
    manifest.sigstore.json
```

Raw data is not included in publishable packages by default.

`od4a redact <source-package-dir> <output-package-dir>` creates a new local
package with redacted canonical JSONL and does not mutate the source package. It
refuses non-empty output directories and builds a new allowlisted projection:
direct IDs are salted and hashed, infrastructure IDs are dropped, and event
`data` is rebuilt from derived facts only. Raw content in `data`, `extensions`,
unknown keys, prompts, messages, tool commands, and tool outputs is dropped
instead of masked. Free-token envelope strings do not survive: source
harness/adapter names, actor roles, consent scopes, and risk labels must match
known OD4A vocabularies; consent receipt IDs are salted and hashed; source
harness kind/version, adapter version, consent policy version, and input
`redactions[]` annotations are dropped. A separate verifier must accept each
projected record before the record is marked `public_safe_redacted` and
`raw_data_capable: false`; out-of-range numeric channels such as very large
`sequence` values suppress the record.
Records that cannot be verified are suppressed and itemized in the redaction
report; the command exits with status `3` when suppression occurs. The result is
still a local package; public release needs separate manifest, consent,
validation, and publication gates.

`od4a manifest` can generate a local-review `metadata/manifest.json` with
checksums, byte counts, row counts, adapter metadata, and validation status. It
marks raw imported canonical JSONL as raw local-review data, recognizes
`od4a redact` output records that explicitly declare `raw_data_capable: false`,
and does not create a signed, publishable release manifest.

`od4a dataset-card` can generate a local `metadata/dataset-card.md` from the
manifest. The generated card summarizes metadata, consent and redaction
references, source adapters, license/access terms, and safety notes without
including raw interaction text.

`od4a hf-sample` can materialize a local Hugging Face dataset-style directory
from a public-safe package. It writes a root `README.md` with dataset card
front matter and copies the manifest, listed JSONL data files, consent receipts,
and redaction reports. The command fails closed for local-review packages, raw
files, files that omit an explicit `contains_raw_data: false`, failed
validation, stale file checksums, non-active consent, or non-publishable
redaction reports. Redaction reports must also declare `review_required: false`
and no suppressed records. It is not an upload or publication command.

`od4a publish-hf` uses the same public-safe gates, then publishes the generated
Hugging Face dataset layout to a public dataset repository only when the user
passes `--yes` and provides `HF_TOKEN` or `HUGGINGFACE_TOKEN` in the environment.
Upload Git commands disable configured credential helpers so the token is not
persisted by Git.
`--dry-run` performs the validation and reports the target repository without
creating or uploading anything. Existing target repositories must not contain
tracked files outside the generated OD4A package set, so stale or raw files are
not silently left public. The command is intentionally limited to
`public_release` packages; controlled-research packages should use a controlled
access workflow instead of public Hugging Face publication.

`od4a derive-tables` can generate a local `data/tables/events.jsonl` projection
and `data/tables/events.schema.json` sidecar from canonical OD4A JSONL. The
derived table keeps event metadata, source, actor, consent, risk, data-kind,
release-level, and text-count fields without copying raw message text or tool
command strings. The sidecar records column names, simple types, nullability,
row count, the canonical source path, and `raw_data_included: false`. It is
intended as the stable dependency-free table shape that a later Parquet writer
can encode.

## Required Manifest Concepts

- Package ID and version.
- Release tier.
- Schema version.
- Creation time.
- Publisher or steward.
- License or access terms.
- Files, media types, sizes, row counts, and checksums.
- Consent receipt references.
- Redaction report references.
- Source adapters and versions.
- Validation status.
- Takedown or supersession status.

## Formats

- JSONL is the canonical interchange format.
- Parquet is the analytics format.
- Large blobs should be content-addressed and excluded unless explicitly
  cleared.
- Public packages should avoid high-cardinality partitions such as donor IDs,
  exact model IDs, file paths, locations, or rare labels.

## Splits

Splits must not be message-random. They should be grouped by donor, conversation,
or near-duplicate cluster to reduce contamination and privacy leakage.

Every split must record algorithm, seed, grouping key, dedupe method, and
exclusion criteria.

## Takedowns

Takedowns are dataset events. Controlled releases should notify recipients and
require deletion attestations. Public releases should publish replacement
versions and tombstone indexes without exposing sensitive reasons.
