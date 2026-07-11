# StudyHelper

Open-source, self-hostable study companion. Plan your entire degree, manage learning materials, and prepare for exams with AI support — as an offline-capable PWA.

> ⚠️ Beta (0.x) — things may still change or break.

## Features

- 🎓 Degree programs, semesters, modules (icon, color, status, thesis flag) — managed inline from the sidebar tree and a drag & drop semester board on the dashboard
- 🧮 Realistic grading: one final assessment per module with retake attempts (configurable limit), pass/fail modules, assignment bonus rules (percent points or grade steps with conditions), a configurable percent→grade matrix per program, ECTS-weighted averages
- 🗂️ Module workspace: materials (folders, rename, drag & drop), graded assignments with deadlines/points/linked materials, flashcards, quizzes, contacts and a module chat
- 📅 Calendar with month/week grid view (drag & drop rescheduling), all-day events, type colors, module/category filters, private ICS subscription feed, and study-plan sessions overlaid
- 🤖 An AI **agent** in a floating chat dock (with an equivalent fullscreen mode): knows which page/module you're looking at, searches your materials (RAG over pgvector), reads your module details, and can create decks, quizzes, events and assignments — every write behind a confirmation card
- 📋 Per-user audit log: every CRUD operation recorded with actor (you or the AI), filterable and undoable with one click — including what the AI read to answer
- 🧠 Learning sessions: start from a module with flashcards (due / random / in-order / previously-wrong / least-practiced) or a quiz, optional Pomodoro autostart, result screen and an AI analysis of your full history ("what should I deepen?")
- 🗓️ AI semester study plan: set weekly availability, vacations and recurring absences (cron); the AI schedules study, review and assignment sessions around exams and deadlines — visible in the calendar and as a "study today" dashboard card
- 🃏 Spaced repetition with FSRS (3D card flip), quizzes with editable questions, score history and retry-mistakes mode; AI grading of free-text answers, homework help (Socratic hints or full solutions), writing assistant and thesis coach with attempt tracking
- 📈 Learning statistics: streaks, activity heatmap and study time per module, plus an auto-cycling Pomodoro timer (long breaks included) that books focus time to a module
- 🔗 External resources per module: Moodle, ILIAS, fileshares, Discord & co. with encrypted notes
- 📚 Materials stored locally (PDF, video, audio, slides, links) with inline viewers and playback-position memory
- 🌐 Works with commercial APIs (Anthropic, OpenAI, Google, Mistral, Groq) and self-hosted models (Ollama, any OpenAI-compatible endpoint) — admin-managed keys plus optional per-user BYOK, token usage tracking and limits
- 🔐 Multi-user: email/password, passkeys (WebAuthn), TOTP 2FA, GitHub/Google and generic OIDC SSO (Keycloak, Authentik, Zitadel, Authelia, …); registration open, closed or via invite links
- 🌍 i18n (German & English), light/dark mode, responsive, installable PWA with offline reading and an offline write queue that syncs on reconnect
- 🔔 Granular notifications: category × channel matrix (events, assignment deadlines, daily study plan) via email and web push, configurable offsets per event
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

Optional: set `SEED_TEST_DATA=true` in `.env` to get two demo accounts with sample content on first start (see [docs/self-hosting.md](docs/self-hosting.md)).

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
