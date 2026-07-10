# StudyHelper

Open-source, self-hostable study companion. Plan your entire degree, manage learning materials, and prepare for exams with AI support — as an offline-capable PWA.

## Features

- 🎓 Degree programs, semesters, modules, grades (ECTS-weighted averages), deadlines and a calendar with a private ICS subscription feed
- 🔗 External resources per module: Moodle, ILIAS, fileshares, Discord & co. with encrypted notes
- 📚 Materials stored locally (PDF, video, audio, slides, links) with inline viewers and playback-position memory
- 🤖 AI everywhere: streaming chat with RAG over your own materials (pgvector), study-plan generation, flashcard & quiz generation, AI grading of free-text answers, homework help (Socratic hints or full solutions), academic writing assistant, thesis coach with topic brainstorming, outline and milestone generation
- 🧠 Spaced repetition with FSRS, quizzes with score history and retry-mistakes mode, tasks with subtasks, learning goals
- 🌐 Works with commercial APIs (Anthropic, OpenAI, Google, Mistral, Groq) and self-hosted models (Ollama, any OpenAI-compatible endpoint) — admin-managed keys plus optional per-user BYOK, token usage tracking and limits
- 🔐 Multi-user: email/password, passkeys (WebAuthn), TOTP 2FA, GitHub/Google and generic OIDC SSO (Keycloak, Authentik, Zitadel, Authelia, …)
- 🌍 i18n (German & English), light/dark mode, responsive, installable PWA with offline reading and an offline write queue that syncs on reconnect
- 🔔 Reminders via email and web push (configurable offsets per event)
- ⚙️ Everything configurable from the admin panel

See [docs/self-hosting.md](docs/self-hosting.md) for deployment details.

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

Next.js (App Router) · TypeScript · Tailwind CSS v4 + shadcn/ui · Drizzle ORM · PostgreSQL + pgvector · Better Auth · Vercel AI SDK · next-intl · pg-boss · ts-fsrs · Dexie

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
