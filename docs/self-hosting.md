# Self-hosting StudyHelper

## Requirements

- Docker + Docker Compose
- Optional: a reverse proxy with HTTPS (Caddy, Traefik, nginx) for public access.
  Web push and PWA installation require HTTPS (or `localhost`).

## Quick start

```bash
git clone https://github.com/veniplex/study-helper.git && cd study-helper
cp .env.example .env
# edit .env: set BETTER_AUTH_SECRET, ENCRYPTION_KEY (openssl rand -base64 32), APP_URL, POSTGRES_PASSWORD
docker compose up -d
```

Open the app, register — **the first account automatically becomes admin.**
Database migrations run automatically on startup. Uploads are stored in
`./data/uploads`, the database in `./data/db`.

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
| `UPLOAD_DIR` | no | Upload directory (default `/data/uploads` in Docker) |
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

Back up the `./data` directory (database + uploads) and your `.env`.
