# Deployment (Vercel — API + web)

This monorepo deploys **web and Nest API together** on one Vercel project. No Docker.

- Web: static files from `apps/web/dist`
- API: serverless function at `/api/[...path]`
- Routes: `/v1/*` and `/health/*` go to the API; everything else is the SPA
- Nest `@Cron` does **not** run on Vercel — the nightly job runs from Vercel Cron, the hourly job and push/SMS dispatch from GitHub Actions (see "Scheduled jobs" below)

## One-time setup

1. Create a project at [vercel.com](https://vercel.com) linked to this Git repo (root = repo root).
2. Framework preset: **Other**. Build command and install already come from `vercel.json`:
   - Install: `pnpm install`
   - Build: `pnpm run build:vercel`
3. In Vercel → **Settings → Environment Variables**, add (Production + Preview):

| Name | Notes |
|------|--------|
| `DATABASE_URL` | Supabase pooler URL (`?pgbouncer=true`) |
| `DIRECT_URL` | Supabase direct URL (port 5432) for Prisma |
| `JWT_SECRET` | ≥32 chars, same as local if you want shared sessions |
| `CORS_ORIGIN` | `https://evoqedlivestockfarm.vercel.app` (`.vercel.app` hosts are also allowed in code) |
| `STORAGE_DRIVER` | `local` or `mongodb` / `r2` as needed |
| `FCM_SERVICE_ACCOUNT_JSON` | One-line Firebase service-account JSON |
| `NOTIFICATION_CRON_SECRET` | Random string; same value in GitHub Actions secret |
| `CRON_SECRET` | Random string; Vercel Cron sends it to `/v1/jobs/nightly`. May equal `NOTIFICATION_CRON_SECRET` |
| `SPARROW_SMS_TOKEN` / `SPARROW_SMS_FROM` | Recommended SMS for Nepal (NTC + Ncell). Used first when set |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Optional fallback SMS provider |
| `SMS_MONTHLY_CAP` | Optional, default 40 |

4. Deploy (push to `main` if Git integration is on, or):

```bash
npx vercel login
npx vercel link
npx vercel --prod
```

5. Confirm API is up:

```text
https://evoqedlivestockfarm.vercel.app/health/live
https://evoqedlivestockfarm.vercel.app/v1/...
```

## Point mobile at Vercel

In `apps/mobile/.env` (and EAS `preview` / `production` env):

```env
EXPO_PUBLIC_API_URL=https://evoqedlivestockfarm.vercel.app
EXPO_PUBLIC_WEB_URL=https://evoqedlivestockfarm.vercel.app
```

No trailing slash. Paths already include `/v1/...`.

## Scheduled jobs (required on Vercel)

1. Set `NOTIFICATION_CRON_SECRET` and `CRON_SECRET` in Vercel env (the same value is fine), then redeploy.
2. GitHub repo → **Settings → Secrets and variables → Actions**:
   - Secret `API_BASE_URL` = `https://evoqedlivestockfarm.vercel.app`
   - Secret `NOTIFICATION_CRON_SECRET` = same as Vercel
   - Variable `ENABLE_NOTIFICATION_CRON` = `true`
3. What then runs:
   - Vercel Cron (from `scripts/vercel-output.mjs`): `GET /v1/jobs/nightly` daily at 19:15 UTC (01:00 Nepal) — task cleanup and all nightly generators.
   - `.github/workflows/scheduled-jobs.yml`: `POST /v1/jobs/hourly` every hour; "Run workflow" can also start `nightly` by hand.
   - `.github/workflows/notification-dispatch.yml`: `POST /v1/notifications/dispatch` every 5 minutes.
4. After the first night, check Vercel → Logs for `/v1/jobs/nightly` (status 200 and a `ms` field). The function limit is 60 s.

## Migrations

Vercel does not run Prisma migrate on boot. From your machine (with `DATABASE_URL` / `DIRECT_URL` in `apps/api/.env`):

```bash
pnpm --filter @farm/api db:migrate
```

## Health checks

- `GET /health/live`
- `GET /health/ready`
