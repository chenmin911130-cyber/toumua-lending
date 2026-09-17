# Batch 01–02 implementation report

Date: 2026-09-17. Local only. Railway was not opened.

## Done

- pnpm monorepo: `apps/api`, `apps/web`, `apps/desktop`, `packages/contracts`, `packages/ui`, `tests/e2e`
- Local PostgreSQL 16 (`toumua_dev`, `toumua_test`) and Mailpit
- `docker-compose.yml` kept for others; this Mac used Homebrew services
- Auth, invitation, session, CSRF, audit, empty customer lists
- Pages: C01, C02, C07, C10, A01–A07, A02, S16, S19; remaining staff/customer routes are auth-gated shells
- Electron window loads staff login with sandbox / contextIsolation / no nodeIntegration

## Tests actually run

| Suite | Result |
| --- | --- |
| `pnpm test:api` AUTH-01…08, STAFF-01…04, public-register-is-customer | 13 passed |
| `pnpm test:e2e` register→Mailpit→verify→C10; invite Cashier→activate→staff | 2 passed |
| `pnpm --filter @toumua/web build` | passed |

## Not implemented (next batches)

- Borrowers, applications, valuation, terms, approval, intake
- Disbursement, repayment, corrections, return, sale
- Real search/notification content, print, CSV, D01 overlay
- Official interest/fee/default policy
- Railway schema mapping and any production migration

## External blockers

- Railway PostgreSQL not inspected
- Production mail sender / domain not provided
- Contact phone/email/address unset (C07 shows configured empty state)
- Official calculation and default/surplus rules not provided
- Electron target OS / signing not confirmed (dev verified on macOS only)

## Commands

```bash
brew services start postgresql@16
brew services start mailpit
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
# http://127.0.0.1:5173
# http://127.0.0.1:3001/api/docs
# pnpm dev:desktop
# pnpm test:api
# pnpm test:e2e
```

Bootstrap admin: `admin@example.com` / `ChangeMeAdmin12`.
