# Kharka Farm OS

Farm management for a mixed farm in Nepal (buffalo, cows, goats, pigs, poultry, fish): a web dashboard for the office, an Android app for the shed, and one API behind both. English and Nepali throughout.

Live: <https://evoqedlivestockfarm.vercel.app> (web + API on Vercel, PostgreSQL on Supabase).

## Contents

- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [First-time setup](#first-time-setup)
- [Running locally](#running-locally)
- [Environment variables](#environment-variables)
- [Database and migrations](#database-and-migrations)
- [Quality checks](#quality-checks)
- [Deploying the web app and API (Vercel)](#deploying-the-web-app-and-api-vercel)
- [Scheduled jobs](#scheduled-jobs)
- [Building the Android app (EAS)](#building-the-android-app-eas)
- [Committing safely](#committing-safely)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)

## Repository layout

| Path | Package | What it is |
|---|---|---|
| `apps/api` | `@farm/api` | NestJS REST API: auth, roles, audit, tasks/reminders, notifications (PostgreSQL + Prisma) |
| `apps/web` | `@farm/web` | React (Vite) dashboard, desktop-first |
| `apps/mobile` | `@farm/mobile` | Expo SDK 52 (React Native) Android app: shed rounds, QR scan, today's work, offline sync |
| `packages/contracts` | `@farm/contracts` | Shared Zod schemas, role/permission map, DTO types (built to `dist/`) |
| `packages/design-tokens` | `@farm/design-tokens` | Colours, spacing and type for web and mobile (built to `dist/`) |
| `packages/eslint-config`, `packages/tsconfig` | — | Shared tooling config |
| `scripts/vercel-output.mjs` | — | Packs web + API into `.vercel/output` (Build Output API), including the cron list |
| `.github/workflows` | — | CI, notification dispatch (every 5 min), hourly jobs |
| `docs/` | — | Architecture, roles, deployment, reminder rules, work summaries |

## Prerequisites

- **Node.js 22+** and **pnpm 11.17** (`corepack enable` picks the version from `package.json`).
- **PostgreSQL 16+**: local Docker (`docker compose up -d db`) or a Supabase project.
- For the Android app: **Android Studio** with an emulator (or a phone with **Expo Go**), and `adb` on your PATH (`%LOCALAPPDATA%\Android\Sdk\platform-tools`).
- For app builds: an [Expo](https://expo.dev) account and `npm i -g eas-cli`.
- For deploys: access to the Vercel project and the GitHub repo settings.

## First-time setup

```bash
pnpm install
pnpm --filter @farm/contracts build       # rebuild after changing packages/contracts
pnpm --filter @farm/design-tokens build

cp apps/api/.env.example apps/api/.env      # set DATABASE_URL and JWT_SECRET (≥ 32 chars)
cp apps/mobile/.env.example apps/mobile/.env

docker compose up -d db                     # skip if DATABASE_URL points at Supabase
pnpm --filter @farm/api db:generate
pnpm --filter @farm/api db:migrate
pnpm --filter @farm/api db:seed             # demo farm + admin / manager / worker
```

Seed logins (password = `SEED_PASSWORD`, default `ChangeMe123!`): `admin@farm.local`, `manager@farm.local`, `worker@farm.local`.

## Running locally

| What | Command | URL |
|---|---|---|
| API (watch mode) | `pnpm dev:api` | <http://localhost:4001> — OpenAPI docs at `/docs` |
| API (built, no watch) | `pnpm --filter @farm/api build && pnpm --filter @farm/api start` | same |
| Web | `pnpm dev:web` | <http://localhost:5173> — proxies `/v1` to the API |
| Mobile (Metro for Expo Go) | `pnpm dev:mobile` | scan the QR in Expo Go, or see below |

**Android emulator**

```powershell
cd apps/mobile
$env:EXPO_PUBLIC_API_URL = "http://10.0.2.2:4001"   # the emulator's name for your PC
npx expo start --go --port 8081
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081
```

**Physical phone with Expo Go**: same Wi-Fi as the PC, and set `EXPO_PUBLIC_API_URL=http://<PC LAN IP>:4001`.

> If your local `.env` points at the shared Supabase database, everything you do locally changes real farm data, and the local API also runs the scheduled jobs (reminders, push dispatch) against it. Use a local database for experiments.

## Environment variables

Never commit real values. `.env` and `.env.*` are git-ignored; only the `*.example` files are tracked.

### API (`apps/api/.env`, and Vercel → Settings → Environment Variables)

| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres URL. On Supabase use the pooler URL with `?pgbouncer=true` |
| `DIRECT_URL` | Supabase | Direct connection (port 5432) used by Prisma migrations; defaults to `DATABASE_URL` |
| `JWT_SECRET` | yes | ≥ 32 random characters |
| `PORT` | no | Default 4000; use **4001** locally (web proxy and mobile expect it) |
| `CORS_ORIGIN` | no | Web origin, e.g. `https://evoqedlivestockfarm.vercel.app` (`*.vercel.app` is allowed in code) |
| `ACCESS_TOKEN_TTL_SEC` / `REFRESH_TOKEN_TTL_DAYS` | no | Defaults 900 s / 30 days |
| `STORAGE_DRIVER` | no | `local` (default), `mongodb` (needs `MONGODB_URI`) or `r2` (needs `R2_*`) — receipts, photos, exports |
| `FCM_SERVICE_ACCOUNT_JSON` | for push | Firebase service-account JSON on one line. Empty = push is only logged |
| `SPARROW_SMS_TOKEN` / `SPARROW_SMS_FROM` | for SMS | Sparrow SMS (NTC + Ncell), used first |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | no | Fallback SMS provider |
| `SMS_MONTHLY_CAP` | no | SMS per farm per Nepali month, default 40 |
| `NOTIFICATION_CRON_SECRET` | Vercel | Protects `/v1/notifications/dispatch` and `/v1/jobs/*`; same value as the GitHub secret |
| `CRON_SECRET` | Vercel | Vercel Cron sends it as `Authorization: Bearer …` to `/v1/jobs/nightly`; may equal `NOTIFICATION_CRON_SECRET` |
| `SEED_PASSWORD` | no | Password for seeded users (local only) |

Generate secrets with `openssl rand -base64 32`.

### Web (`apps/web`)

| Name | Notes |
|---|---|
| `API_PROXY_TARGET` | Dev only: where Vite proxies `/v1` (default `http://localhost:4001`). In production web and API share one origin. |

### Mobile (`apps/mobile/.env`, and EAS environment variables)

| Name | Notes |
|---|---|
| `EXPO_PUBLIC_API_URL` | API origin, no trailing slash. Emulator `http://10.0.2.2:4001`; builds use the Vercel URL (set in `eas.json`) |
| `EXPO_PUBLIC_WEB_URL` | Web origin for the "Desktop" mode |
| `GOOGLE_SERVICES_JSON` | EAS **file** variable holding `google-services.json` (Firebase push). Locally the file sits in `apps/mobile/` and is git-ignored |
| `EAS_PROJECT_ID` | Optional override of the Expo project id in `app.config.ts` |

## Database and migrations

- Schema: `apps/api/prisma/schema.prisma`; migrations: `apps/api/prisma/migrations/`.
- New migration while developing: `pnpm --filter @farm/api db:migrate:dev --name <change>`.
- Apply migrations to any database (including production): `pnpm --filter @farm/api db:migrate` with that database's `DATABASE_URL` / `DIRECT_URL` in `apps/api/.env`. **Vercel does not run migrations**; run this before deploying code that needs them.
- After schema changes: `pnpm --filter @farm/api db:generate`.

## Quality checks

```bash
pnpm -r typecheck
pnpm -r lint          # the web app has 8 known warnings; there should be no errors
pnpm -r test
pnpm build            # packages + api + web
```

Per package: `pnpm --filter @farm/<api|web|mobile|contracts> <typecheck|lint|test>`. CI (`.github/workflows/ci.yml`) runs the same on every push and pull request.

## Deploying the web app and API (Vercel)

One Vercel project serves both: the web build as static files, and the API as one serverless function. `/v1/*` and `/health/*` go to the API; everything else is the web app.

1. Vercel project linked to this repo, root = repo root, framework **Other**. Install and build come from `vercel.json` (`pnpm install`, `pnpm run build:vercel`).
2. Add the API environment variables above (Production and Preview).
3. Run migrations against the production database if the schema changed.
4. Push to `main` — Vercel builds and deploys. Manual deploy: `npx vercel --prod`.
5. Check <https://evoqedlivestockfarm.vercel.app/health/live> and `/health/ready`.

Details: [docs/deployment.md](docs/deployment.md).

## Scheduled jobs

On a normal server the API runs these itself (Nest `@Cron`, Nepal time). On Vercel nothing runs between requests, so each job has an endpoint that something outside must call:

| Job | What it does | Trigger on Vercel |
|---|---|---|
| Nightly, 01:00 Nepal | Expires stale tasks (30 days late; 3 days for one-moment work such as heat watch or a dose), closes older reminder steps, then generates breeding, vaccine, withhold, stock, missing-milk and finance tasks | **Vercel Cron** → `GET /v1/jobs/nightly` (in `scripts/vercel-output.mjs`; needs `CRON_SECRET`) |
| Hourly | Breeding service windows; escalates unanswered CRITICAL alerts | GitHub Actions `scheduled-jobs.yml` → `POST /v1/jobs/hourly` |
| Every 5 min | Sends due push / SMS notifications | GitHub Actions `notification-dispatch.yml` → `POST /v1/notifications/dispatch` |

Turning them on:

1. Vercel env: `CRON_SECRET` and `NOTIFICATION_CRON_SECRET` (can be the same value). Redeploy.
2. GitHub → repo **Settings → Secrets and variables → Actions**:
   - secret `API_BASE_URL` = `https://evoqedlivestockfarm.vercel.app`
   - secret `NOTIFICATION_CRON_SECRET` = same as Vercel
   - variable `ENABLE_NOTIFICATION_CRON` = `true`
3. Run once by hand to test: **Actions → Scheduled jobs → Run workflow → nightly**, or

```bash
curl -X POST https://evoqedlivestockfarm.vercel.app/v1/jobs/nightly -H "x-cron-secret: <secret>"
```

If these never run, open tasks pile up in "Today's work" and reminders stop being created.

## Building the Android app (EAS)

```bash
cd apps/mobile
eas login
eas build -p android --profile preview      # installable APK for testing
eas build -p android --profile production   # Play Store app bundle (AAB)
```

- Profiles are in `apps/mobile/eas.json`; both point the app at the Vercel API.
- Upload `google-services.json` once as the EAS file variable `GOOGLE_SERVICES_JSON` (Expo dashboard → project → Environment variables) for push notifications.
- Phones only get new mobile code from a new build. Web and API changes are live as soon as Vercel deploys.

## Committing safely

- Add files by name (`git add path/to/file`), not `git add .`.
- Never commit `.env`, `.env.*` (except `*.example`), `google-services.json`, or `.vercel/output` — all are in `.gitignore`.
- If a real secret is ever committed, rotate it (generate a new one and update Vercel / GitHub / EAS); deleting it from the file is not enough.

## Troubleshooting

| Problem | Fix |
|---|---|
| Web shows "Something went wrong" after a while | The saved session expired (the API logs "Refresh token reuse detected"). Sign out and sign in again. |
| Expo Go asks you to sign in again | Normal after Metro or Expo Go restarts. |
| Emulator can't reach Metro | `adb reverse tcp:8081 tcp:8081`, then reopen `exp://127.0.0.1:8081`. |
| Emulator can't reach the API | Use `http://10.0.2.2:4001` (not `localhost`) in `EXPO_PUBLIC_API_URL`. |
| Code changes don't show in Expo Go | Metro printed "CI mode, reloads are disabled" — unset `CI` or restart Metro, then force-stop and reopen Expo Go. |
| Today's work is full of old tasks | The nightly job isn't running in production — see [Scheduled jobs](#scheduled-jobs). |
| Types from `@farm/contracts` look stale | `pnpm --filter @farm/contracts build`. |
| Vercel function boots but Prisma fails | `build:vercel` must run `db:generate` (it does); check `DATABASE_URL` / `DIRECT_URL`. |

## Documentation

- [docs/architecture.md](docs/architecture.md) — system design and module boundaries
- [docs/rbac.md](docs/rbac.md) — roles and permissions
- [docs/deployment.md](docs/deployment.md) — Vercel deployment runbook
- [docs/sync.md](docs/sync.md) — mobile offline sync
- [docs/notification-reminders.pdf](docs/notification-reminders.pdf) — which reminders exist and who gets them
- [apps/mobile/README.md](apps/mobile/README.md) — mobile app notes
- Work summaries: [2026-09-20 mobile](docs/mobile-work-summary-2026-09-20.pdf), [2026-10-06](docs/work-summary-2026-10-06.pdf), [2026-10-13](docs/work-summary-2026-10-13.pdf)
