# Contributing

Thank you for contributing to opendata4all.

## Ground Rules

- Do not add example data that contains real personal data, secrets, credentials,
  private source code, customer data, employer data, or third-party copyrighted
  material.
- Do not add adapters that scrape private internals, intercept network traffic,
  harvest browser state, or rely on undocumented platform storage.
- Privacy regressions block releases.
- Tests and fixtures should use synthetic data with explicit canaries for
  redaction behavior.

## Developer Certificate of Origin

Code contributions use Developer Certificate of Origin sign-off:

```text
Signed-off-by: Your Name <you@example.com>
```

By signing off, you certify that you have the right to submit the contribution
under the project license.

## Data Contributions

Data donations are not code contributions. They require a separate consent and
data donor agreement workflow. Do not submit real donated interaction records
through issues, pull requests, examples, or test fixtures.

## Pull Request Expectations

- Keep changes scoped.
- Add or update schema validation when changing schemas.
- Add fixture tests for adapter behavior when adding adapters.
- Update documentation when changing privacy, consent, release, or governance
  behavior.
