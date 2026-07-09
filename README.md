# StudyHelper

Open-source, self-hostable study companion. Plan your entire degree, manage learning materials, and prepare for exams with AI support — as an offline-capable PWA.

> **Status:** early development (Phase 0 of 8 — foundation).

## Features (planned)

- 🎓 Manage degree programs, semesters, modules, grades and deadlines
- 📚 Store materials locally (PDF, video, audio, slides, links) with inline viewers
- 🤖 AI support for every step: study plans, flashcards, quizzes, assignments, thesis planning — works with commercial APIs (Anthropic, OpenAI, Google, …) and self-hosted models (Ollama, any OpenAI-compatible endpoint)
- 🧠 Spaced repetition (FSRS), quizzes with progress tracking, learning goals
- 🔐 Multi-user with email/password, passkeys, 2FA, GitHub/Google and generic OIDC SSO (Keycloak, Authentik, Zitadel, …)
- 🌍 i18n (German & English), light/dark mode, responsive, PWA with offline support
- 🔔 Reminders via email and web push
- ⚙️ Everything configurable from the admin panel

## Quick start (development)

```bash
npm install
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL (pgvector)
npm run db:migrate
npm run dev
```

Open http://localhost:3000.

## Self-hosting (production)

```bash
cp .env.example .env   # fill in secrets
docker compose up -d
```

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 + shadcn/ui · Drizzle ORM · PostgreSQL + pgvector · Better Auth · Vercel AI SDK · next-intl · Serwist · pg-boss

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm test` | Run unit tests |
| `npm run lint` / `typecheck` | Static checks |
| `npm run db:generate` | Generate migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Drizzle Studio (DB browser) |
