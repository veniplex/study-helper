# StudyHelper

Open-source, self-hostable study companion. Plan your entire degree, manage learning materials, and prepare for exams with AI support — as an offline-capable PWA.

## Features

- 🎓 Degree programs, semesters, modules, grades (ECTS-weighted averages), deadlines and a calendar with a private ICS subscription feed
- 🗂️ Module-centric workspace: pick your program and active semester in the sidebar, then plan everything per module — materials, tasks (kanban board with drag & drop), flashcards, quizzes, study plans and a module chat in one place
- 🔗 External resources per module: Moodle, ILIAS, fileshares, Discord & co. with encrypted notes
- 📚 Materials stored locally (PDF, video, audio, slides, links) with inline viewers and playback-position memory
- 🤖 AI everywhere: streaming chat with RAG over your own materials (pgvector), study-plan generation, flashcard & quiz generation, AI grading of free-text answers, homework help (Socratic hints or full solutions), academic writing assistant, thesis coach with topic brainstorming, outline and milestone generation
- 🧠 Spaced repetition with FSRS, quizzes with score history and retry-mistakes mode, tasks with subtasks, learning goals
- 📈 Learning statistics: streaks, a 26-week activity heatmap and study time per week/module, plus a Pomodoro timer in the header that books focus time to a module
- 💬 Floating AI quick chat (desktop) that stays open while you navigate and knows which page/module you are looking at
- 🌐 Works with commercial APIs (Anthropic, OpenAI, Google, Mistral, Groq) and self-hosted models (Ollama, any OpenAI-compatible endpoint) — admin-managed keys plus optional per-user BYOK, token usage tracking and limits
- 🔐 Multi-user: email/password, passkeys (WebAuthn), TOTP 2FA, GitHub/Google and generic OIDC SSO (Keycloak, Authentik, Zitadel, Authelia, …); registration open, closed or via invite links
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
