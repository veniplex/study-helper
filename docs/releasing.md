# Releasing a new version

Docker images are built and published automatically by GitHub Actions
([`.github/workflows/release.yml`](../.github/workflows/release.yml)) —
no local Docker build or manual push to the registry is needed.

## How the pipeline works

| Git event | Published image tags |
| --- | --- |
| Push to `main` | `ghcr.io/veniplex/study-helper:main`, `:edge` |
| Push a tag `vX.Y.Z` | `:X.Y.Z`, `:X.Y`, `:X`, `:latest` |

## Steps for a release (example: 1.0.1)

1. **Make sure `main` is clean and up to date**

   ```sh
   git checkout main
   git pull
   git status   # no uncommitted changes
   ```

2. **Bump the version in `package.json`**

   ```json
   "version": "1.0.1"
   ```

3. **Commit the version bump**

   ```sh
   git add package.json
   git commit -m "release: v1.0.1"
   ```

4. **Tag the commit and push both**

   ```sh
   git tag v1.0.1
   git push origin main --tags
   ```

5. **Wait for the workflow** — check the *Actions* tab on GitHub.
   The `Release` workflow builds a multi-arch image (amd64 + arm64)
   and pushes it to `ghcr.io/veniplex/study-helper` with the tags
   `1.0.1`, `1.0`, `1` and `latest`.

6. **Update the deployment** (e.g. Portainer):
   - If the stack uses `:latest` (default), re-pull the image and
     recreate the container ("Re-pull image and redeploy" in Portainer).
   - If the version is pinned, set `STUDYHELPER_VERSION=1.0.1` in the
     stack environment and redeploy.

## Notes

- Tags must follow the `vX.Y.Z` scheme — other tag names do not trigger
  the semver image tags.
- A push to `main` alone only updates `:main`/`:edge`, **not** `:latest`.
  Production deployments tracking `:latest` only change when a `v*` tag
  is pushed.
- Database migrations run automatically on container start, so a normal
  redeploy is sufficient after upgrading.
