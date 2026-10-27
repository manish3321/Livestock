# Roles and permissions

Five roles, defined in `packages/contracts/src/roles.ts` and enforced server-side by `PermissionsGuard`. The web and mobile clients import the same map for navigation and action visibility, but the API is the authority — a worker calling a financial endpoint gets `403 PERMISSION_DENIED` even if the UI rendered the button.

## Role summary

| Role | Access |
|---|---|
| **ADMIN** | Full access: operations, money, reports, user management, audit log, escalated expense approvals |
| **MANAGER** | Everything operational plus expense approval, revenue, P&L, reports, exports, change approvals |
| **WORKER** | View + data entry on operational records; submit expenses; shed rounds; no revenue / P&L / reports |
| **VET** | Animals (read), health, breeding, inventory (read only), production (read), shed/rounds, scan, inbox/tasks, sync — no money or admin |
| **COOP** | Animals (read), production (read), revenue (read), finance (read), reports — no shed, inventory write, or P&L module |

Admin ⊃ Manager ⊃ Worker for the core farm roles (verified by tests). VET and COOP are separate specialist maps, not supersets of Worker.

## Permission matrix

| Permission | WORKER | MANAGER | ADMIN | VET | COOP |
|---|---|---|---|---|---|
| `animals:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `animals:write` | ✓ | ✓ | ✓ | — | — |
| `animals:delete` | — | ✓ | ✓ | — | — |
| `groups` / `fish` read+write | ✓ | ✓ | ✓ | — | — |
| `health` / `breeding` read+write | ✓ | ✓ | ✓ | ✓ | — |
| `production:read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `production:write` | ✓ | ✓ | ✓ | — | — |
| `feed` read+write | ✓ | ✓ | ✓ | — | — |
| `inventory:read` | ✓ | ✓ | ✓ | ✓ | — |
| `inventory:restock-request` | ✓ | ✓ | ✓ | — | — |
| `inventory:write` | — | ✓ | ✓ | — | — |
| `expenses:read`, `expenses:submit` | ✓ | ✓ | ✓ | — | — |
| `expenses:approve` | — | ✓ | ✓ | — | — |
| `expenses:approve-escalated` | — | — | ✓ | — | — |
| `revenue:read` | — | ✓ | ✓ | — | ✓ |
| `revenue:write` | — | ✓ | ✓ | — | — |
| `finance:read` | — | ✓ | ✓ | — | ✓ |
| `reports:read`, `export:data` | — | ✓ | ✓ | — | reports only |
| `tasks:read` | ✓ | ✓ | ✓ | ✓ | — |
| `tasks:manage` | — | ✓ | ✓ | — | — |
| `rounds:read` / `rounds:write` | ✓ | ✓ | ✓ | ✓ | — |
| `sync:use` | ✓ | ✓ | ✓ | ✓ | — |
| `changes:approve` | — | ✓ | ✓ | — | — |
| `users:manage`, `farm:manage`, `audit:read` | — | — | ✓ | — | — |

`COOP` has `finance:read` for cooperative views but **not** the `pnl` module (Profit / P&L routes stay Admin/Manager).

## Module visibility (`MODULE_ACCESS`)

| Module | Roles |
|---|---|
| dashboard, animals, batches | ADMIN, MANAGER, WORKER, VET, COOP |
| groups, fish, feed, expenses | ADMIN, MANAGER, WORKER |
| scan, health, breeding, shed, inbox | ADMIN, MANAGER, WORKER, VET |
| inventory | ADMIN, MANAGER, WORKER, VET |
| production | ADMIN, MANAGER, WORKER, COOP |
| revenue, reports | ADMIN, MANAGER, COOP |
| pnl | ADMIN, MANAGER |
| admin | ADMIN |

The web sidebar derives from this map via `modulesForRole`. Nav links that need an extra permission (e.g. Profit under `pnl` + `finance:read`) must not show for roles that lack the module.

## Expense approval flow

Worker submits (`expenses:submit`) → Manager approves/rejects (`expenses:approve`) → amounts above the per-category threshold escalate to Admin (`expenses:approve-escalated`). The permission model above already encodes this chain.

## Adding a permission

1. Add it to `PERMISSIONS` and the appropriate role arrays in `packages/contracts/src/roles.ts`.
2. Guard the endpoint with `@RequirePermissions('new:permission')`.
3. Rebuild contracts (`pnpm --filter @farm/contracts build`); the web app picks it up automatically.
4. Extend `test/roles.test.ts` if the permission has cross-role rules.
5. Keep this doc in sync with `roles.ts` — that file is the source of truth.
