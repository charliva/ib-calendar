# Agent Skills

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical label strings. See `docs/agents/triage-labels.md`.

### Domain docs

The repository uses a single-context domain-docs layout. See `docs/agents/domain.md`.

## Git and deployment workflow

- **Never push to `main` (production)** unless the user explicitly asks for it.
  Agents may suggest when a change is ready for production, but the user has
  final say.
- **Push regularly to `alpha`** as the staging branch. Deploy `alpha` to a
  Vercel preview and validate it against localhost-style checks (typecheck,
  lint, tests, build, and smoke checks) before promoting.
- **Only push to `beta`** once the change works on `alpha`. `beta` is the
  pre-production candidate branch.
- **Commit sizing**:
  - `alpha` receives small, focused commits.
  - `beta` receives medium, feature-complete commits.
  - `main` (production) receives only large, validated release commits.
