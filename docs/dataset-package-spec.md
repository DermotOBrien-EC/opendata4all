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

`od4a manifest` can generate a local-review `metadata/manifest.json` with
checksums, byte counts, row counts, adapter metadata, and validation status. It
marks canonical JSONL as raw local-review data and does not create a signed,
publishable release manifest.

`od4a dataset-card` can generate a local `metadata/dataset-card.md` from the
manifest. The generated card summarizes metadata, consent and redaction
references, source adapters, license/access terms, and safety notes without
including raw interaction text.

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
