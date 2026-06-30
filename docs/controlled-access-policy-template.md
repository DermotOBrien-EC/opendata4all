# Controlled Access Policy Template

This template is a starting point for an OD4A data access committee. It is not
legal advice and must be reviewed by the project steward, privacy lead, and
legal counsel before real donated records are accepted or shared.

## Scope

- Dataset or package ID: `[PACKAGE_ID]`
- Release tier: `controlled_research` or `secure_enclave`
- Controller or steward: `[STEWARD_NAME]`
- Contact: `[PRIVACY_CONTACT]`
- Applicable manifest hash: `[SHA256_MANIFEST_HASH]`
- Applicable consent receipt set: `[CONSENT_RECEIPT_REFERENCES]`
- Applicable redaction report set: `[REDACTION_REPORT_REFERENCES]`

This policy does not authorize public release of raw AI interaction records.
Public release requires a separate release review, public-safe manifest, and
dataset card.

## Access Tiers

- `tier_2_controlled_research`: approved researchers receive redacted or
  pseudonymized record-level data under a signed data use agreement.
- `tier_3_secure_enclave`: higher-risk records, embeddings, linkage keys, or
  rawer traces remain in an approved secure environment.
- `tier_4_quarantine`: suspected illegal content, live secrets, unresolved
  takedowns, or records needing legal review are not released.

## Eligibility

Applicants must provide:

- Legal name, institutional affiliation, and contact.
- Research purpose and public-interest justification.
- Data minimization statement identifying the smallest needed fields.
- Ethics, IRB, DPIA, or equivalent review status where applicable.
- Security controls for storage, access logging, encryption, and incident
  response.
- Publication and derivative-output plan.

## Review Criteria

Approve access only when all criteria are met:

- The requested purpose is compatible with donor consent and recorded purposes.
- The requested data class and release tier match the manifest and consent
  receipts.
- The package has passed validation or has an explicit written waiver.
- Redaction reports show no unresolved blocked findings for the requested tier.
- Third-party personal data, employer data, proprietary data, and
  special-category or sensitive data are minimized or excluded.
- The applicant accepts re-identification, redistribution, model-training,
  and onward-transfer restrictions.
- The applicant accepts takedown, withdrawal, and deletion obligations.

## Required Restrictions

Approved users must not:

- Attempt re-identification of donors, third parties, employers, clients, or
  institutions.
- Redistribute record-level data or provide onward access without written
  approval.
- Publish raw transcripts, secrets, credentials, local file paths, full URLs,
  hidden prompts, source files, or private tool outputs.
- Use the data for surveillance, employment decisions, credit, insurance,
  policing, military targeting, harassment, or deanonymization.
- Train or fine-tune public models on controlled records unless explicitly
  permitted by the data use agreement and consent receipts.
- Combine controlled records with external datasets in a way that materially
  increases re-identification risk.

## Security Baseline

At minimum, approved users must:

- Limit access to named approved users.
- Use MFA for accounts that access controlled records.
- Encrypt data at rest and in transit.
- Keep audit logs for access and transfer events.
- Store data only in approved systems and jurisdictions.
- Report suspected incidents within `[INCIDENT_REPORTING_WINDOW]`.
- Delete or return data by the retention deadline.

## Takedown And Withdrawal

The steward must maintain a withdrawal and takedown process. Approved users must:

- Stop processing affected records after notice.
- Delete or quarantine affected records within `[DELETION_WINDOW]`.
- Delete derived intermediate files where feasible.
- Provide a deletion attestation when requested.
- Use replacement manifests or tombstone indexes supplied by the steward.

## Outputs And Publication

Public outputs must be reviewed before release when they contain examples,
quotes, rare labels, model memorization probes, or high-risk aggregates.
Outputs must not include raw donated text unless the steward has recorded
specific approval, consent compatibility, copyright review, and privacy review.

## Review Record

- Application ID: `[ACCESS_APPLICATION_ID]`
- Decision: `[APPROVED | DENIED | MORE_INFORMATION_NEEDED]`
- Reviewer names or committee IDs: `[REVIEWERS]`
- Decision date: `[YYYY-MM-DD]`
- Approved data scope: `[FIELDS_OR_FILES]`
- Approved purpose: `[PURPOSE]`
- Expiry or review date: `[YYYY-MM-DD]`
- Conditions: `[CONDITIONS]`

