# Consent Model

Consent must be explicit, informed, granular, recorded, and revocable.

## Consent Flow

1. Local inventory: show the candidate source, project, date range, item count,
   data classes, risk flags, and package size.
2. Redaction and scope editing: let users exclude records, adjust redaction, and
   choose data classes.
3. Preview: show the exact redacted package and manifest that would leave the
   device.
4. Consent: record an affirmative decision with separate purposes and release
   tiers.
5. Receipt: produce a user-readable and machine-readable consent receipt.

The CLI may generate draft receipt templates to help users and stewards review
the exact manifest hash and scope fields. A draft receipt is not active consent;
activation requires an affirmative user action and an actionable withdrawal path.
Local validation can check required fields, scope boundaries, and manifest-hash
binding, but it does not decide whether consent is legally valid.

## Granular Scopes

Consent should be scoped by:

- Source platform or harness.
- Project, workspace, repository, or account.
- Time range.
- Data class.
- Purpose.
- Release tier.
- Recipients or recipient classes.
- Retention period.
- Sensitive-data handling.

## Consent Receipt Fields

Receipts should include:

- Consent receipt ID.
- Timestamp and timezone.
- Consent notice version.
- Controller or steward identity.
- Source and adapter.
- Data classes and release tier.
- Purposes and recipients.
- Redaction policy version.
- Package or manifest hash.
- Retention and expiry.
- Withdrawal path.
- Current status.

## Withdrawal

Withdrawal must stop future consent-based processing. Where deletion is
required, the system should remove active managed copies, suppress unreleased
derivatives, notify controlled-access recipients where applicable, and record a
minimal audit/tombstone entry.

Public releases must explain that downstream copies may not be fully recallable.
