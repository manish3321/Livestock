# Roles and permissions

Three roles, defined in `packages/contracts/src/roles.ts` and enforced server-side by `PermissionsGuard`. The web client imports the same map for navigation/action visibility, but the API is the authority — a worker calling a financial endpoint gets `403 PERMISSION_DENIED` even if the UI rendered the button.

## Role summary

| Role | Access |
|---|---|
| **Admin / Farm Owner** | Full access, including user management, audit log, and escalated expense approvals |
| **Farm Manager** | Everything operational plus expense approval, revenue, P&L, reports, exports |
| **Farm Worker** | View + data entry on operational records; submit expenses; no financial reads |

Permissions are strict supersets: `WORKER ⊂ MANAGER ⊂ ADMIN` (verified by tests).

## Permission matrix

| Permission | WORKER | MANAGER | ADMIN |
|---|---|---|---|
| `animals:read` / `animals:write` | ✓ | ✓ | ✓ |
| `animals:delete` | — | ✓ | ✓ |
| `groups` / `fish` / `health` / `breeding` / `production` read+write | ✓ | ✓ | ✓ |
| `inventory:read`, `inventory:restock-request` | ✓ | ✓ | ✓ |
| `inventory:write` | — | ✓ | ✓ |
| `expenses:read`, `expenses:submit` | ✓ | ✓ | ✓ |
| `expenses:approve` | — | ✓ | ✓ |
| `expenses:approve-escalated` | — | — | ✓ |
| `revenue:read` / `revenue:write` | — | ✓ | ✓ |
| `finance:read` (P&L) | — | ✓ | ✓ |
| `reports:read`, `export:data` | — | ✓ | ✓ |
| `users:manage`, `farm:manage`, `audit:read` | — | — | ✓ |

## Module visibility (web sidebar)

Workers do not see Revenue, P&L, or Reports. All other modules are visible to all roles (`MODULE_ACCESS` in contracts). The web sidebar derives from this map via `modulesForRole`.

## Expense approval flow

Worker submits (`expenses:submit`) → Manager approves/rejects (`expenses:approve`) → amounts above the per-category threshold escalate to Admin (`expenses:approve-escalated`). The permission model above already encodes this chain.

## Adding a permission

1. Add it to `PERMISSIONS` and the appropriate role arrays in `packages/contracts/src/roles.ts`.
2. Guard the endpoint with `@RequirePermissions('new:permission')`.
3. Rebuild contracts (`pnpm --filter @farm/contracts build`); the web app picks it up automatically.
4. Extend `test/roles.test.ts` if the permission has cross-role rules.
