# Deployment (Vercel — API + web)

This monorepo deploys **web and Nest API together** on one Vercel project. No Docker.

- Web: static files from `apps/web/dist`
- API: serverless function at `/api/[...path]`
- Routes: `/v1/*` and `/health/*` go to the API; everything else is the SPA
- Nest `@Cron` does **not** run on Vercel — use GitHub Actions (`notification-dispatch.yml`) for push/SMS dispatch

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
| `CORS_ORIGIN` | Your Vercel URL, e.g. `https://your-app.vercel.app` (`.vercel.app` hosts are also allowed in code) |
| `STORAGE_DRIVER` | `local` or `mongodb` / `r2` as needed |
| `FCM_SERVICE_ACCOUNT_JSON` | One-line Firebase service-account JSON |
| `NOTIFICATION_CRON_SECRET` | Random string; same value in GitHub Actions secret |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Optional CRITICAL SMS |
| `SMS_MONTHLY_CAP` | Optional, default 40 |

4. Deploy (push to `main` if Git integration is on, or):

```bash
npx vercel login
npx vercel link
npx vercel --prod
```

5. Confirm API is up:

```text
https://YOUR_PROJECT.vercel.app/health/live
https://YOUR_PROJECT.vercel.app/v1/...
```

## Point mobile at Vercel

In `apps/mobile/.env` (and EAS `preview` / `production` env):

```env
EXPO_PUBLIC_API_URL=https://YOUR_PROJECT.vercel.app
```

No trailing slash. Paths already include `/v1/...`.

## Notification cron (required on Vercel)

1. Set `NOTIFICATION_CRON_SECRET` in Vercel env (and locally).
2. GitHub repo → **Settings → Secrets and variables → Actions**:
   - Secret `API_BASE_URL` = `https://YOUR_PROJECT.vercel.app`
   - Secret `NOTIFICATION_CRON_SECRET` = same as Vercel
   - Variable `ENABLE_NOTIFICATION_CRON` = `true`
3. Workflow `.github/workflows/notification-dispatch.yml` POSTs every 5 minutes to `/v1/notifications/dispatch`.

## Migrations

Vercel does not run Prisma migrate on boot. From your machine (with `DATABASE_URL` / `DIRECT_URL` in `apps/api/.env`):

```bash
pnpm --filter @farm/api db:migrate
```

## Health checks

- `GET /health/live`
- `GET /health/ready`
