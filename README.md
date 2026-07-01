# opendata4all

opendata4all is a local-first toolkit for voluntary donation of AI interaction
data for open research.

The project is designed to help people review, redact, consent to, and package
their own user/LLM/tool interaction data without tying the format to one model
provider, IDE, chat product, or agent harness.

## Principles

- Explicit opt-in only.
- Local redaction and preview before upload or publication.
- Consent must be informed, granular, recorded, and revocable.
- Raw AI interaction logs are treated as high-risk personal data by default.
- Redacted data is not described as anonymous unless an anonymization assessment
  supports that claim.
- Public release is reserved for low-risk, consent-compatible records,
  aggregates, labels, examples, or synthetic data.
- Record-level data should default to controlled research access.
- No scraping of private app internals, network traffic, tokens, cookies,
  browser state, or undocumented platform storage.

## MVP Scope

The first milestone is a documentation and schema foundation:

- A canonical event schema for AI interaction records.
- A consent receipt schema.
- A redaction report schema.
- A release manifest schema.
- Privacy, consent, adapter, governance, and roadmap documentation.

Implementation work should remain local-first: import, normalize, redact,
preview, validate, package, then optionally upload through an explicit command.

## Planned Architecture

```text
adapter
  -> local encrypted staging
  -> normalize to OD4A events
  -> classify and score risk
  -> redact locally
  -> preview package
  -> record consent receipt
  -> build signed release package
  -> optional controlled upload
```

The canonical format is an append-only event log. Analytics and publication
formats are derived from that log, usually JSONL for interchange and Parquet for
research queries.

## Documentation

- [Architecture](docs/architecture.md)
- [CLI](docs/cli.md)
- [Privacy Model](docs/privacy-model.md)
- [Consent Model](docs/consent-model.md)
- [Adapter Strategy](docs/adapter-strategy.md)
- [Dataset Package Specification](docs/dataset-package-spec.md)
- [Controlled Access Policy Template](docs/controlled-access-policy-template.md)
- [Data Use Agreement Template](docs/data-use-agreement-template.md)
- [Validation](docs/validation.md)
- [MVP Roadmap](docs/mvp-roadmap.md)
- [Governance](GOVERNANCE.md)
- [Security](SECURITY.md)

The `od4a` CLI currently supports local package, redaction, validation, consent,
risk review, and first adapter commands:

```bash
od4a init od4a-package
od4a import ./records.jsonl od4a-package
od4a import-openai-api ./openai-app-log.jsonl od4a-package
od4a import-codex-hook ./codex-hook-log.jsonl od4a-package
od4a import-claude-code-hook ./claude-code-hook-log.jsonl od4a-package
od4a manifest od4a-package
od4a dataset-card od4a-package
od4a derive-tables od4a-package
od4a hf-sample examples/minimal-package ./hf-sample
od4a publish-hf examples/minimal-package --repo your-hf-name/od4a-example --dry-run
od4a publish-hf examples/minimal-package --repo your-hf-name/od4a-example --yes
od4a scan od4a-package
od4a report od4a-package
od4a preview od4a-package
od4a validate-package od4a-package
od4a consent-draft od4a-package
od4a validate-consent od4a-package/receipts/consent-draft.json od4a-package
od4a withdraw-consent od4a-package/receipts/active-consent.json
od4a export od4a-package
od4a redact od4a-package od4a-redacted-package
od4a validate
od4a inspect examples/minimal-package
```

## License

Code is licensed under Apache-2.0. Dataset releases, examples, schemas, docs,
and donated records may use different terms. See
[GOVERNANCE.md](GOVERNANCE.md) for the intended split-license posture.
