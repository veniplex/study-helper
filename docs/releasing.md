# Releasing a new version

Version bumps, git tags, and Docker images are all handled automatically by
GitHub Actions. In the normal case there is nothing to do manually.

## How the pipeline works

1. **On every PR merged into `main`**
   ([`.github/workflows/version-bump.yml`](../.github/workflows/version-bump.yml)):
   - The bump type (`patch`/`minor`/`major`) is derived from the PR title
     using [Conventional Commits](https://www.conventionalcommits.org/):
     - `feat!: ...` or `fix!: ...` (a `!` after the type) → **major**
     - `feat: ...` → **minor**
     - anything else (`fix:`, `chore:`, `docs:`, `refactor:`, no prefix, …) → **patch**
   - `package.json` / `package-lock.json` are bumped, committed directly to
     `main` as `chore(release): vX.Y.Z (#PR)`, tagged `vX.Y.Z`, and a GitHub
     Release is created.
   - Add the **`skip-release`** label to a PR to opt it out entirely (e.g. a
     docs-only or CI-only change that shouldn't ship a new image).
   - The commit + tag are pushed with the default `GITHUB_TOKEN`, and GitHub
     does not let `GITHUB_TOKEN`-authored pushes trigger other workflows'
     `push` events (anti-recursion protection). So the last step explicitly
     runs `gh workflow run release.yml --ref vX.Y.Z` to kick off the image
     build — `workflow_dispatch` calls are exempt from that restriction.

2. **`release.yml`** builds and publishes the image:

   | Trigger | Published image tags |
   | --- | --- |
   | Push to `main` (a normal PR merge) | `ghcr.io/veniplex/study-helper:main`, `:edge` |
   | `workflow_dispatch` on tag `vX.Y.Z` (from step 1) or a manual `v*` tag push | `:X.Y.Z`, `:X.Y`, `:X`, `:latest` |

   So merging a PR produces both back to back — `:main`/`:edge` update from
   the merge itself, and the versioned tags (including `:latest`) follow
   once `version-bump.yml` tags and dispatches the release build.

3. **Update the deployment** (e.g. Portainer):
   - If the stack uses `:latest` (default), re-pull the image and
     recreate the container ("Re-pull image and redeploy" in Portainer).
   - If the version is pinned, set `STUDYHELPER_VERSION=X.Y.Z` in the
     stack environment and redeploy.

## Manual release (fallback)

Only needed if the automated workflow can't run (e.g. it's disabled, or a
version needs correcting by hand):

```sh
git checkout main
git pull
git status              # no uncommitted changes

# bump "version" in package.json by hand, then:
git add package.json package-lock.json
git commit -m "chore(release): vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

## Notes

- Tags must follow the `vX.Y.Z` scheme — other tag names do not trigger
  the semver image tags.
- A push to `main` alone only updates `:main`/`:edge`, **not** `:latest`.
  Production deployments tracking `:latest` only change when a `v*` tag
  is pushed.
- `version-bump.yml` pushes directly to `main` using the default
  `GITHUB_TOKEN`. If branch protection on `main` requires pull requests
  for everyone, allow the `github-actions[bot]` actor to bypass that rule
  (or the workflow's push will fail after merge).
- Database migrations run automatically on container start, so a normal
  redeploy is sufficient after upgrading.
