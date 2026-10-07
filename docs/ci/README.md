# CI workflows, ready to switch on

GitHub only accepts files under `.github/workflows/` from a token with the
`workflow` permission, and the automated session that wrote these did not have
it, so they live here instead. To switch them on:

```bash
mkdir -p .github/workflows
cp docs/ci/ci.yml docs/ci/security-review.yml .github/workflows/
git add .github && git commit -m "Add CI and security review" && git push
```

- `ci.yml`: type-check, lint, unit tests, integration tests on a throwaway
  PostgreSQL 16, and an audit of production dependencies. Not yet run on GitHub;
  watch the first run, since the integration job is the one most likely to need a
  tweak (it needs only `TEST_DATABASE_URL`, which the file sets).
- `security-review.yml`: Anthropic's `claude-code-security-review` on every pull
  request. It needs a repository secret named `CLAUDE_API_KEY` (Settings, Secrets
  and variables, Actions). That key is yours to create and paste; it is never put
  in the repository.
