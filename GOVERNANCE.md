# Governance

opendata4all is built around open governance and controlled research access.
Raw AI interaction data is not treated as open data.

## Stewardship

Before accepting real donations, the project needs a named legal steward or
controller, public contact details, a privacy lead, a security lead, and a
documented incident response process.

## Access Tiers

- `tier_0_public_metadata`: governance docs, schemas, codebooks, release notes,
  aggregate statistics, and safe examples.
- `tier_1_public_sample`: small manually reviewed or synthetic examples.
- `tier_2_controlled_research`: redacted or pseudonymized records under a data
  use agreement.
- `tier_3_secure_enclave`: high-risk records, rawer traces, embeddings, or
  linkage keys available only through approved secure settings.
- `tier_4_quarantine`: suspected illegal content, live secrets, third-party
  harm, unresolved takedowns, or records requiring legal review.

## Release Review

Every release containing donated records should have:

- Consent and provenance validation.
- Redaction and secret scan summaries.
- Benchmark contamination assessment.
- Copyright and proprietary-data risk review.
- Takedown and withdrawal process verification.
- Dataset card and release manifest.

## Licensing Posture

- Code: Apache-2.0.
- Documentation: Apache-2.0 or CC-BY-4.0.
- Schemas and aggregate metadata: CC0 only where rights are clear.
- Clean public datasets: CDLA-Permissive-2.0 is the default recommendation.
- Sensitive or provenance-uncertain datasets: controlled access under a data use
  agreement, not an open license.

This is a policy baseline, not legal advice.
