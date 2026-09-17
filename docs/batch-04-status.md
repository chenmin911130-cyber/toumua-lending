# Batch 04: approval, collateral intake, disbursement and repayment

Status: data model and migration applied; application code not yet written.

## What is in place

| Item | State |
| --- | --- |
| `prisma/schema.prisma` Batch 04 models | Written and structurally reviewed (23 models, 15 enums, all relations paired) |
| Migration `20260918090000_batch_04_loans_custody_ledger` | Applied to `toumua_dev` and `toumua_test`, registered in `_prisma_migrations` |
| Exact decimal money (`src/lending/money.ts`) | Done, 16 unit tests passing |
| Test-only calculation policy (`src/lending/calculation-policy.ts`) | Done, production blocked |
| API contracts (`packages/contracts/src/lending.ts`) | Done |
| Generated Prisma client | **Not regenerated** — see blocker below |
| Services, controllers, staff UI, integration tests | Not started |

## Blocker: the Prisma CLI cannot run here

`prisma generate` and `prisma migrate` both hang in an infinite loop while
loading the CLI's own `build/cli.js`. This was verified to be independent of the
file sandbox (identical hang with full access) and of the Node version (22, 24
and 26 all hang).

The migration was therefore applied with `psql` and recorded in
`_prisma_migrations` with the SHA-256 of its `migration.sql`, so a normal
`prisma migrate` on a working machine treats it as already applied and will not
try to re-run it.

`prisma generate` has no such workaround. The generated client still contains
only the Batch 01–03 models, so `prisma.loan`, `prisma.ledgerEntry`,
`prisma.receipt`, `prisma.paymentAttempt`, `prisma.custodyEvent`,
`prisma.scheduleEntry` and `prisma.applicationDecision` do not exist yet.

Extending the generated client by hand was attempted and abandoned deliberately.
Two of the three required pieces can be rewritten: the runtime model table and
the operation name table. The third, `config.parameterizationSchema.graph`, is a
binary encoding of the schema that the WASM query compiler validates every query
against. A model absent from that graph is rejected with

> Operation 'findMany' for model 'Loan' does not match any query.

Re-encoding that graph by hand is not something that can be done reliably, and a
half-working money client is worse than none.

## To unblock

Once the CLI works on your machine:

```bash
pnpm db:migrate     # no-op: the Batch 04 migration is already applied
pnpm db:generate    # regenerates the client with the Batch 04 models
```

Then the remaining Batch 04 work can proceed against a real, generated client.

## Also fixed

`apps/api/node_modules/@prisma/client-runtime-utils` was missing, so the
generated client could not even be `require`d (`Cannot find module
'@prisma/client-runtime-utils'`). A link to the existing pnpm store entry was
added, matching the sibling `@prisma/client` and `@prisma/adapter-pg` links. This
is what `pnpm install` would normally create.
