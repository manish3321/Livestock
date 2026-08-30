# Farm Management System

Web admin dashboard for a mixed farm (livestock, poultry, fish) in Nepal. Built for the Evoqed Digital brief: 12 modules, three roles (Admin / Manager / Worker), expense approval workflows, category/age batch tracking, and CSV reporting.

## Repository layout

| Path | Package | Description |
|---|---|---|
| `apps/api` | `@farm/api` | NestJS REST API — auth, RBAC, audit (PostgreSQL + Prisma) |
| `apps/web` | `@farm/web` | React (Vite) desktop-first dashboard |
| `packages/contracts` | `@farm/contracts` | Shared Zod schemas, RBAC permission map, domain types |
| `packages/design-tokens` | `@farm/design-tokens` | Semantic colors/spacing/typography for the web UI |
| `packages/eslint-config`, `packages/tsconfig` | — | Shared tooling configuration |

## Prerequisites

- Node.js 22+, pnpm 11 (`corepack enable`)
- Docker (for local PostgreSQL and MongoDB) — or any PostgreSQL 16+ instance. Mongo is used for file storage (receipts/exports) when `STORAGE_DRIVER=mongodb`.

## Getting started

```bash
pnpm install
pnpm --filter @farm/contracts build
pnpm --filter @farm/design-tokens build

# Database (Postgres) + MongoDB (file storage)
docker compose up -d db mongo
cp apps/api/.env.example apps/api/.env   # then set JWT_SECRET
# Set STORAGE_DRIVER=mongodb to store receipts in GridFS (default is local disk)
pnpm --filter @farm/api db:generate
pnpm --filter @farm/api db:migrate       # applies prisma/migrations
pnpm --filter @farm/api db:seed          # farm + admin/manager/worker users

# Run
pnpm dev:api    # http://localhost:4000  (OpenAPI docs at /docs)
pnpm dev:web    # http://localhost:5173  (proxies /v1 to the API)
```

Seed logins (password is `SEED_PASSWORD`, default `ChangeMe123!`):
`admin@farm.local`, `manager@farm.local`, `worker@farm.local`.

## Quality checks

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm build          # api + web + packages
```

CI (GitHub Actions) runs the same steps on every push/PR.

## Documentation

- [docs/architecture.md](docs/architecture.md) — system design and module boundaries
- [docs/rbac.md](docs/rbac.md) — roles, permissions, and navigation
- [docs/deployment.md](docs/deployment.md) — DigitalOcean deployment runbook
- [docs/Farm-Management-Progress-Summary.pdf](docs/Farm-Management-Progress-Summary.pdf) — daily progress (latest: QR & scan, 22 Aug 2026)
- [docs/Farm-Management-Daily-Update-2026-08-22.pdf](docs/Farm-Management-Daily-Update-2026-08-22.pdf) — same update (dated copy)

## Status

**Web dashboard:** all 12 modules are implemented (API + web UI), including unified herd batch tracking, monthly CSV/PDF reports, expense receipts/budgets, fish water/sampling/harvest, feed logs, admin members/audit, and inventory valuation.

Modules: Dashboard, Livestock (batches), Poultry, Fish, Expenses (approval workflow), Revenue, P&L, Inventory, Health Records, Breeding, Production, Reports. Admin (members + audit) for Admin role.
