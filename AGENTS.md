# Agent Skills

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical label strings. See `docs/agents/triage-labels.md`.

### Domain docs

The repository uses a single-context domain-docs layout. See `docs/agents/domain.md`.

### UI implementation

Implement UI changes directly in the application and validate them on localhost.

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

## Vercel deployment commands

- Branch deploys are **not** automatic for `alpha`/`beta`; only `main`
  auto-deploys from GitHub. After pushing a branch, run the deploy manually:
  - `alpha`: `git push origin alpha && vercel deploy --yes`
  - `beta`: `git push origin beta && vercel deploy --yes`
- Run deploys from the branch being deployed (`git checkout alpha` first, etc.).
  `vercel deploy --yes` deploys the current working tree as a preview.
- Never run `vercel deploy --prod` or `vercel --prod` unless the user
  explicitly asks for a production deploy.
