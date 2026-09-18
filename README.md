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
- API / OpenAPI: http://127.0.0.1:3001/api/docs
- Mailpit: http://127.0.0.1:8025
- Desktop: `pnpm dev:desktop` (loads the staff login)

Demo logins (password `123456` for all). Seed or refresh with `pnpm db:seed-demo`:

- Customer: `sarah.tama@toumua.nz` at `/login`
- Staff: `staff@toumua.nz` at `/staff/login` — simple files up to $3,000
- Manager: `manager@toumua.nz` at `/staff/login` — larger or complex files, staff accounts
- Admin: `admin@toumua.nz` at `/staff/login`

Public registration only creates Customer accounts.

## Test

```bash
pnpm test:api
pnpm test:e2e
```

API tests use `toumua_test` and a memory mail adapter. They do not touch Railway.

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

## Notes

- Do not migrate or overwrite the existing Railway database.
- Official interest, fees, and default rules are not implemented (client policy still required).
- Demo office mailbox is `office@toumua.nz` / `noreply@toumua.nz`. Real SMTP still needs a purchased domain.
