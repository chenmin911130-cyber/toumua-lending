# Toumu’a Lending Workspace

Batch 01–02 implementation: local engineering scaffold plus authentication, invitations, and permissions. Design remains in `design/v2/`. This is not a production funds system.

## Start

```bash
# PostgreSQL 16 and Mailpit
# Option A — already used on this Mac:
brew services start postgresql@16
brew services start mailpit

# Option B
docker compose up -d

cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

- Web: http://127.0.0.1:5173
- API / OpenAPI (local only): http://127.0.0.1:3001/api/docs
- Mailpit: http://127.0.0.1:8025
- Desktop: `pnpm dev:desktop` (loads the staff login)

Demo logins (password `project721` for all). Seed or refresh with `pnpm db:seed-demo`:

- Customer: `sarah.tama@toumua.nz` at `/login` — views own applications, loans and receipts; reads reminders at `/notifications`; signs the loan contract at `/customer/contracts/:id`; sees a consented automatic-collection card on `/customer/loans/:loanId`.
- Staff: `staff@toumua.nz` at `/staff/login` — prepares applications and valuations; a manager decides every approve and decline. There is no staff approval limit.
- Manager: `manager@toumua.nz` at `/staff/login` — decides applications, defaults, corrections and staff accounts; runs reminders at `/staff/reminders`; sees the loyalty rate on `/staff/applications/:id/review`.
- Admin: `admin@toumua.nz` at `/staff/login` — staff invitations and the audit log only
- Owner: `owner@toumua.nz` at `/staff/login` — read-only business status and reports at `/staff`; manages staff accounts at `/staff/admin/accounts`; cannot approve loans
- Accountant: `accountant@toumua.nz` at `/staff/login` — read-only business status and ledger
- Cashier: `cashier@toumua.nz` at `/staff/login` — disbursements only after the current contract is signed, repayments, sale proceeds, and consented automatic collection at `/staff/collections`.
- Valuation officer: `valuation@toumua.nz` at `/staff/login` — valuations, named storage locations at `/staff/storage`, asset history on `/staff/collateral/:id`, return, and sale

Public registration only creates Customer accounts.

```bash
pnpm seed:demo    # accounts + sample applications/loans, safe to re-run
```

After seeding, each login should show work: Sarah has an active loan, receipts, a signed contract, and an active borrower-consented automatic collection; James is waiting for a manager decision; Mere is waiting for a valuation; Ana is still a draft; David has a payment due today; Sione is overdue; Lisa has one settled loan and a submitted application that previews the Returning discount (−200 bps); Toma is in default; Rachel was declined; Peter is approved, his contract is issued and unsigned, and he is waiting for the cashier to disburse. One stored asset has a single relocation in its history. The reminder outbox has rows from one runDue during that seed. Owner, manager and accountant see business status at /staff. Cashier sees transactions.

## Client requirements coverage (Alice, 29 Sep)

| Requirement | Coverage |
| --- | --- |
| R1 | A manager is the only role that approves or declines, on `/staff/applications/:id/review`. There is no staff approval limit. |
| R2 | Security is stored in named locations and linked to the borrower and the loan. Occupancy is on `/staff/storage`. |
| R3 | Text reminders are on `/staff/reminders`. The contract is frozen at approval and must be signed at `/customer/contracts/:id` before disbursement. Consented automatic collection is on `/staff/collections` and `/customer/loans/:loanId`. |
| R4 | Owner and manager manage staff at `/staff/admin/accounts`. A borrower reads loans, reminders at `/notifications`, and the contract. A cashier records repayments and opens `/staff/receipts/:id`. |
| R5 | A stored asset keeps its identifier, condition, value, and status, plus a history that includes a move, on `/staff/collateral/:id`. |
| R6 | `/` states text reminders, online signing, and automatic repayments. `/help` answers those three plus the discount. `/loans` states Returning −200 bps from 1 settled loan and Loyal −400 bps from 3 or more, frozen at approval. |

## Test

```bash
# API suite: creates a throwaway PostgreSQL cluster in /tmp, migrates it,
# runs the tests, then stops and deletes only that cluster.
pnpm test:api:isolated

# A single file or extra reporter also works:
node scripts/test-api-isolated.mjs test/unit.spec.ts

# Mocked browser UI checks. Starts its own loopback Vite server with envDir
# disabled, does not read .env, and does not start or proxy to the API.
node --experimental-strip-types scripts/test-auckland-date.mjs
pnpm test:web:ui

# UNSAFE / not isolated: `pnpm test:e2e` boots the real API and web against the
# local .env database. Do not run it as part of the isolated checks above, and
# do not treat it as a mocked browser suite.
pnpm test:e2e
```

API tests are **fail-closed**. `apps/api/test/helpers.ts` no longer reads `.env`
and refuses to load unless the isolated runner has exported its disposable
database markers, so a bare `pnpm test:api` stops with an error instead of
truncating a developer or production database. The runner uses the locally
installed Homebrew `postgresql@16` binaries (override with `TOUMUA_PG_BIN`) and
the repository's existing `prisma`/`vitest` binaries; it never installs packages
and never connects to an existing server. Tests use a memory mail adapter.

## Railway

Deploy as a **new** Railway project with a **new** Postgres plugin (do not point at an existing production database).

1. Create project and add Postgres template.
2. Add two services from this repo (`main`): **api** and **web**.
3. **api** — build: `pnpm install && pnpm db:generate && pnpm --filter @toumua/contracts build && pnpm --filter @toumua/api build`  
   pre-deploy: `pnpm db:migrate:deploy`  
   start: `pnpm --filter @toumua/api start`  
   healthcheck: `/api/v1/health`  
   env: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `NODE_ENV=production`, `COOKIE_SECURE=true`, `PUBLIC_WEB_URL=<web public URL>`, plus `SESSION_SECRET` / `CSRF_SECRET` / bootstrap admin vars.
4. **web** — build: `pnpm install && pnpm --filter @toumua/contracts build && pnpm --filter @toumua/web build`  
   start: `pnpm --filter @toumua/web preview`  
   env: `API_PROXY_TARGET=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}`
5. Generate a public domain on **web**; set that URL as `PUBLIC_WEB_URL` on **api** and redeploy.
6. After the first deploy, run demo seed on the **api** service (one-off shell or `railway run` from the repo root with `DATABASE_URL` set):  
   `pnpm db:seed-demo` — creates staff/customer logins **and** five demo storage locations (required for collateral intake).  
   Optional full classroom walkthrough: `pnpm seed:demo` (accounts, locations, and sample applications/loans).

## Notes

- Do not migrate or overwrite the existing Railway database.
- Official interest, fees, and default rules are not implemented (client policy still required).
- Demo office mailbox is `office@toumua.nz` / `noreply@toumua.nz`. Real SMTP still needs a purchased domain.
- Production API does not mount `/api/docs`. Set `ENABLE_API_DOCS=1` only for a private review.
