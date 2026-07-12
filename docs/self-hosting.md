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

| Host path (default) | Container path | Contents |
|---|---|---|
| `./data/db` | Postgres data dir | Everything except files: users, modules, flashcards, grades, events, chat history, settings |
| `./data/uploads` | `/data/uploads` | Uploaded files (PDFs, images, …) |

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

| Area | What |
|---|---|
| Sign-in & SSO | open/closed registration, GitHub/Google login, generic OIDC (Keycloak, Authentik, Zitadel, Authelia, …) |
| AI | providers (Anthropic, OpenAI, Google, Mistral, Groq, Ollama, OpenAI-compatible), models, default + embedding model (enables RAG), monthly token limits |
| Email | SMTP for password resets and reminders, test email |
| Branding | app name, max upload size |

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (pgvector image) |
| `APP_URL` | yes | Public base URL (auth callbacks, emails, push) |
| `BETTER_AUTH_SECRET` | yes | Session signing secret (32+ random bytes) |
| `ENCRYPTION_KEY` | yes | Encrypts stored secrets (API keys, SMTP, notes) |
| `STUDYHELPER_VERSION` | no | Image tag to run (default `latest`); pin e.g. `1.0.0` for reproducible deploys |
| `DATA_DIR` | no | Host directory for the database + uploads volumes (default `./data`, next to `docker-compose.yml`) — see [Where data is stored](#where-data-is-stored) |
| `UPLOAD_DIR` | no | Upload path **inside the container** (default `/data/uploads`) — only relevant for non-Docker deployments; Docker users should set `DATA_DIR` instead |
| `SEED_TEST_DATA` | no | `true` seeds demo accounts (admin@example.com / admin-test-1234, user@example.com / user-test-1234) with sample study content on startup — for evaluation only, never in production |

**Do not lose `ENCRYPTION_KEY`** — encrypted settings (AI keys, SMTP, OIDC secrets) become unreadable without it.

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
