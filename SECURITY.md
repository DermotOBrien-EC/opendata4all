# Security Policy

opendata4all handles data that may include personal data, third-party data,
source code, credentials, and sensitive content. Treat all untrusted input as
hostile.

## Reporting

Report vulnerabilities, privacy leaks, secret exposure, unsafe release behavior,
or takedown failures privately to the maintainers. Do not open public issues
containing real secrets, personal data, raw transcripts, or exploit details.

## Security Requirements

- Raw data must stay local unless a user explicitly opts into a controlled
  upload workflow.
- Redaction must run locally before publication.
- Preview renderers must treat transcripts as inert text.
- Logs must not include raw records, secrets, prompt content, tool results, or
  redaction match text.
- Release artifacts should be signed before non-alpha distribution.
- CI should scan for secrets, dependency vulnerabilities, and unsafe code
  patterns.

## Out Of Scope For MVP

- Hosted ingestion of raw donated data.
- Public attachments.
- Browser extensions with broad host permissions.
- Private app scraping or undocumented transcript harvesting.
