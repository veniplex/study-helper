# Self-hosting StudyHelper

## Requirements

- Docker + Docker Compose
- Optional: a reverse proxy with HTTPS (Caddy, Traefik, nginx) for public access.
  Web push and PWA installation require HTTPS (or `localhost`).

## Quick start

You only need two files — no repository checkout, no local build. The app runs
from the prebuilt image `ghcr.io/veniplex/study-helper`.

```bash
mkdir studyhelper && cd studyhelper

# Grab the compose file and the env template
curl -O https://raw.githubusercontent.com/veniplex/study-helper/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/veniplex/study-helper/main/.env.example

# edit .env: set BETTER_AUTH_SECRET, ENCRYPTION_KEY (openssl rand -base64 32), APP_URL, POSTGRES_PASSWORD
docker compose up -d
```

Open the app, register — **the first account automatically becomes admin.**
Database migrations run automatically on startup.

### Image versions

`docker-compose.yml` uses `:latest` by default. For reproducible deploys, pin a
version in `.env`:

```bash
STUDYHELPER_VERSION=1.0.0
```

Available tags on the [package page](https://github.com/veniplex/study-helper/pkgs/container/study-helper):
`latest` (newest release), `1.0.0`/`1.0`/`1` (semver), `edge` (latest `main`).
Update with `docker compose pull && docker compose up -d`. Images are built for
`linux/amd64` and `linux/arm64`.

## Where data is stored

`docker compose` mounts two directories from the **host** into the
containers, so your data survives container restarts/rebuilds:

| Host path (default)   | Container path       | Contents                                                                                    |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| `./data/db`           | Postgres data dir    | Everything except files: users, modules, flashcards, grades, events, chat history, settings |
| `./data/uploads`      | `/data/uploads`      | Uploaded files (PDFs, images, …)                                                            |
| `./data/tus-incoming` | `/data/tus-incoming` | Staging for in-flight resumable (tus) uploads — transient; cleared once finalized           |

By default both live under `./data`, next to `docker-compose.yml`. To store
them elsewhere — a separate disk, a NAS mount, outside the git checkout —
set `DATA_DIR` in `.env` to an absolute path:

```bash
DATA_DIR=/srv/studyhelper/data
```

Then `docker compose up -d` creates `/srv/studyhelper/data/db` and
`/srv/studyhelper/data/uploads` there instead. Changing `DATA_DIR` after the
first start does **not** move existing data — copy the old directory over
first (see Backup below), or set it correctly before the first
`docker compose up`.

Everything else is configured in **Admin → Settings**:

| Area          | What                                                                                                                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in & SSO | open/closed registration, GitHub/Google login, generic OIDC (Keycloak, Authentik, Zitadel, Authelia, …)                                                                                                                             |
| AI            | providers (Anthropic, OpenAI, Google, Mistral, Groq, Ollama, OpenAI-compatible), models, default + embedding model (enables RAG), monthly token limits, optional Batch API for cheaper async complete-generation (Anthropic/OpenAI) |
| Email         | SMTP for password resets and reminders, test email                                                                                                                                                                                  |
| Branding      | app name, max upload size                                                                                                                                                                                                           |

### AI spending limits

Each user gets **5,000,000 tokens per month** by default. That is far more than
a semester of normal study uses, and it exists so that one account cannot run up
unbounded cost on the provider key you configured for everyone. User-initiated
AI actions are additionally rate limited per user.

Raise the limit under **Admin → AI**, or set it to `0` for no limit — only do
that when every user brings their own API key (Settings → AI), or you are the
only user. If you upgraded from an earlier version and never opened the AI
settings, the new default now applies to you; an explicitly saved `0` is left
alone.

A small dot next to the version number in the sidebar (visible to admins)
shows when a newer release is available on GitHub — checked once a day —
and links to the release. Installing it is a manual
`docker compose pull && docker compose up -d`.

## Environment variables

| Variable              | Required | Description                                                                                                                                                                         |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | yes      | Postgres connection string (pgvector image)                                                                                                                                         |
| `POSTGRES_PASSWORD`   | yes      | Password for the bundled database container. Only applied when the database is **first created** — see the note below                                                                |
| `APP_URL`             | yes      | Public base URL (auth callbacks, emails, push)                                                                                                                                      |
| `BETTER_AUTH_SECRET`  | yes      | Session signing secret (32+ random bytes)                                                                                                                                           |
| `ENCRYPTION_KEY`      | yes      | Encrypts stored secrets (API keys, SMTP, notes)                                                                                                                                     |
| `STUDYHELPER_VERSION` | no       | Image tag to run (default `latest`); pin e.g. `1.0.0` for reproducible deploys                                                                                                      |
| `DATA_DIR`            | no       | Host directory for the database + uploads volumes (default `./data`, next to `docker-compose.yml`) — see [Where data is stored](#where-data-is-stored)                              |
| `UPLOAD_DIR`          | no       | Upload path **inside the container** (default `/data/uploads`) — only relevant for non-Docker deployments; Docker users should set `DATA_DIR` instead                               |
| `TUS_DIR`             | no       | Staging dir for resumable (tus) uploads of very large files (default `<cwd>/data/tus-incoming`); use a persistent volume so interrupted uploads resume after a restart              |
| `STORAGE_DRIVER`      | no       | Where uploaded files live: `local` (default, disk under `UPLOAD_DIR`) or `s3` (S3 / S3-compatible object storage) — see [Object storage (S3)](#object-storage-s3)                   |
| `WORKERS_IN_PROCESS`  | no       | `false` runs background jobs only in a separate worker process (`npm run worker`) instead of the web tier (default `true` — in-process)                                             |
| `SEED_TEST_DATA`      | no       | `true` seeds demo accounts (admin@example.com / admin-test-1234, user@example.com / user-test-1234) with sample study content on startup — for evaluation only, never in production |

**Do not lose `ENCRYPTION_KEY`** — encrypted settings (AI keys, SMTP, OIDC secrets) become unreadable without it.

`BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` must not keep the `change-me`
placeholder from `.env.example`: the app refuses to start with it, since that
value is public. Both should be 32+ random characters
(`openssl rand -base64 32`).

**Changing `POSTGRES_PASSWORD` later has no effect on its own.** PostgreSQL only
reads it when it initializes an empty data directory; afterwards the password
lives in the database. If you started with the old default and want to rotate it,
change it in both places:

```bash
docker compose exec db psql -U study -d study -c "ALTER USER study WITH PASSWORD 'new-password';"
# then set POSTGRES_PASSWORD=new-password in .env
docker compose up -d
```

## Troubleshooting

### Admin shows "file storage is not writable" / uploads fail

Docker Compose creates a bind-mounted host directory (`./data/uploads`) owned
by **root** the first time it doesn't already exist, but the app runs as a
non-root user inside the container — so it can't write to it. The image's
entrypoint fixes this automatically on container start (it corrects
ownership before starting the app). If you still see the warning after a
fresh `docker compose pull && docker compose up -d`, fix it once by hand:

```bash
docker compose exec -u root <app-service-name> \
  sh -c 'chown -R app:app /data/uploads /data/tus-incoming'
```

(`<app-service-name>` is whatever you named the app service in your compose
file — `app` in the example above.) If the warning persists after upgrading,
the volume is likely on a filesystem that ignores container-side chown
entirely (e.g. certain NFS exports with root-squash) — move `DATA_DIR` to a
regular local/host-managed disk.

### The dedicated `worker` container doesn't seem to process anything

The optional `worker` service (commented out by default) runs `npm run
worker`, which needs `tsx` and the raw TypeScript sources — the prebuilt
`ghcr.io/veniplex/study-helper` image is a **standalone, web-server-only**
build and doesn't include either — pointing that service at the prebuilt
image fails fast with a clear startup error instead of silently starting a
second (unreachable) copy of the web server. Unless you build a
custom image from a full source checkout, don't run the `worker` service —
the web tier already processes background jobs in-process by default, which
is sufficient for most deployments. Only reach for `WORKERS_IN_PROCESS=false`
+ a dedicated worker if you're building your own image.

## Object storage (S3)

By default uploaded files are stored on disk (`STORAGE_DRIVER=local`, under
`UPLOAD_DIR` / the `uploads` volume). For large multi-GB modules or multi-node
deployments you can store them in S3 or any S3-compatible service (AWS S3,
MinIO, Cloudflare R2, Hetzner Object Storage) instead:

| Variable              | Required        | Description                                                                         |
| --------------------- | --------------- | ----------------------------------------------------------------------------------- |
| `STORAGE_DRIVER`      | set to `s3`     | Enables the S3 driver                                                               |
| `S3_BUCKET`           | yes (with `s3`) | Target bucket name                                                                  |
| `S3_REGION`           | no              | Bucket region (falls back to `AWS_REGION`, then `us-east-1`)                        |
| `S3_ENDPOINT`         | no              | Custom endpoint URL for S3-compatible services (e.g. MinIO/R2); omit for AWS S3     |
| `S3_FORCE_PATH_STYLE` | no              | `true` for path-style addressing (needed by MinIO and some S3-compatible endpoints) |
| `S3_KEY_PREFIX`       | no              | Optional key prefix (folder) for all objects, e.g. `study-helper`                   |

Credentials come from the standard AWS credential chain — set
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (and `AWS_SESSION_TOKEN` if
applicable), or run on infrastructure with an attached IAM role. The value
stored in the database is a backend-agnostic key, so nothing schema-wise
changes; switching drivers does **not** migrate existing files, so pick a
driver before uploading (or copy the objects yourself when migrating).

## Reverse proxy example (Caddy)

```
study.example.com {
    reverse_proxy localhost:3000
}
```

Set `APP_URL=https://study.example.com` accordingly.

## OIDC quick notes

Create a confidential client in your IdP with redirect URI
`{APP_URL}/api/auth/oauth2/callback/{provider-id}` (the admin panel shows the
exact URL per provider). Enter issuer discovery URL
(`…/.well-known/openid-configuration`), client id and secret in
Admin → Sign-in & SSO.

## Backup

Back up three things: the **database**, the **uploaded files**, and your
**`.env`** (it holds `ENCRYPTION_KEY`, without which every stored secret is
unreadable).

Do **not** simply copy `./data/db` while the stack is running. That directory is
PostgreSQL's live data directory; copying it mid-write produces an inconsistent
snapshot that may refuse to start when you need it (`invalid checkpoint
record`). Dump the database instead:

```bash
# Database — consistent, works while the app is running
docker compose exec -T db pg_dump -U study -Fc study > studyhelper-$(date +%F).dump

# Uploaded files (skip if you use S3 — back up the bucket instead)
tar czf studyhelper-uploads-$(date +%F).tar.gz -C ./data uploads
```

Restore into an empty database:

```bash
docker compose up -d db
docker compose exec -T db pg_restore -U study -d study --clean --if-exists < studyhelper-2026-01-31.dump
docker compose up -d
```

A plain file copy of `./data` is fine too, but only with the stack stopped
(`docker compose down` first) — that is what the `DATA_DIR` move below does.

To move data to a new `DATA_DIR`:

```bash
docker compose down
mkdir -p /new/path
cp -a ./data/. /new/path/
# set DATA_DIR=/new/path in .env
docker compose up -d
```
