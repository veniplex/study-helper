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

A small dot next to the version number in the sidebar (visible to admins)
shows when a newer release is available on GitHub — checked once a day —
and links to the release. Installing it is a manual
`docker compose pull && docker compose up -d`.

## Environment variables

| Variable              | Required | Description                                                                                                                                                                         |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | yes      | Postgres connection string (pgvector image)                                                                                                                                         |
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

Back up the data directory (`DATA_DIR`, or `./data` if unset — database +
uploads) and your `.env`. To move data to a new `DATA_DIR`:

```bash
docker compose down
mkdir -p /new/path
cp -a ./data/. /new/path/
# set DATA_DIR=/new/path in .env
docker compose up -d
```
