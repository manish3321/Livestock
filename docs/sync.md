# Sync endpoints (API only)

The API still exposes `/v1/sync/push` and `/v1/sync/pull` with an idempotency ledger and change feed. These were designed for offline field clients and are **not used by the web dashboard**.

The web app talks to normal REST module endpoints (`/v1/batches`, `/v1/animals`, `/v1/expenses`, etc.) over JWT.

If you need the protocol details for a future client, see `packages/contracts/src/sync.ts` and `apps/api/src/sync/`. Otherwise you can ignore this document for day-to-day web development.
