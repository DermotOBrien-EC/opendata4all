# Data Use Agreement Template

This template is a non-final starting point for controlled OD4A data access. It
is not legal advice. A real agreement must be reviewed by qualified counsel and
must match the governing consent receipts, manifest, jurisdiction, and steward
policy.

## Parties

- Data steward/controller: `[STEWARD_NAME]`
- Approved recipient institution: `[RECIPIENT_INSTITUTION]`
- Approved users: `[NAMED_USERS]`
- Privacy contact: `[PRIVACY_CONTACT]`
- Security contact: `[SECURITY_CONTACT]`

## Dataset

- Package ID: `[PACKAGE_ID]`
- Package version: `[VERSION]`
- Manifest hash: `[SHA256_MANIFEST_HASH]`
- Release tier: `controlled_research` or `secure_enclave`
- Approved files or fields: `[FILES_OR_FIELDS]`
- Consent receipt references: `[CONSENT_RECEIPTS]`
- Redaction report references: `[REDACTION_REPORTS]`

No access is granted to data outside this scope.

## Permitted Purpose

Recipient may use the data only for:

`[SPECIFIC_RESEARCH_PURPOSE]`

Any new purpose, new user, new institution, linkage with external datasets, or
material model-training use requires prior written approval.

## Prohibited Uses

Recipient must not:

- Attempt re-identification, contact, profiling, or targeting of donors,
  third parties, employers, clients, or institutions.
- Redistribute, sell, publish, sublicense, or provide onward access to
  record-level data.
- Publish raw transcripts, secrets, credentials, local file paths, full URLs,
  hidden prompts, source files, private tool outputs, or rare identifying
  excerpts.
- Use the data for surveillance, employment decisions, credit, insurance,
  policing, military targeting, harassment, deanonymization, or harmful
  operational abuse.
- Train, fine-tune, distill, or evaluate public models on controlled records
  unless the approved purpose and consent receipts explicitly allow it.
- Try to recover redacted, suppressed, or withheld content.

## Security Controls

Recipient must:

- Restrict access to named approved users.
- Use MFA and least-privilege access controls.
- Encrypt data at rest and in transit.
- Store data only in approved systems and jurisdictions.
- Keep audit logs for access, export, deletion, and transfer events.
- Prevent copying to personal devices, public buckets, unmanaged notebooks, or
  systems without equivalent controls.
- Notify the steward of suspected incidents within
  `[INCIDENT_REPORTING_WINDOW]`.

## Retention And Deletion

- Retention deadline: `[RETENTION_DEADLINE]`
- Recipient must delete or return controlled records by the deadline.
- Recipient must delete temporary, cached, derived, and backup copies where
  feasible.
- Recipient must provide deletion attestation on request.
- Recipient must stop processing and delete or quarantine affected records after
  withdrawal, takedown, supersession, or legal notice.

## Publication Review

Recipient must submit proposed public outputs for review before release when
outputs include examples, quotes, rare labels, high-risk aggregates, model
memorization analysis, or other content that could expose donors or third
parties. Public outputs must not contain raw donated text unless the steward has
recorded specific approval and compatibility with consent, copyright, and
privacy requirements.

## Audit And Compliance

The steward may request evidence of compliance, including access logs, security
controls, deletion attestations, publication review records, and lists of
approved users. Failure to comply may terminate access and require deletion or
return of data.

## Termination

Access terminates on the earliest of:

- Expiry date: `[EXPIRY_DATE]`
- Completion of the approved purpose.
- Withdrawal of steward approval.
- Breach of this agreement.
- Takedown, supersession, or legal requirement.

Recipient obligations for confidentiality, non-identification, deletion, audit,
and publication review survive termination.

