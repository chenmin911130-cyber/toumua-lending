# Batch 04: approval, collateral intake, disbursement and repayment

Status: **implemented** (API + staff web). Batch 05 covers corrections, default, return, and sale flows.

## Delivered

| Item | State |
| --- | --- |
| Prisma schema + migration `20260918090000_batch_04_loans_custody_ledger` | Applied |
| Generated Prisma client | Run `pnpm db:generate` after pull |
| Exact money + test calculation policy | Done (`money.ts`, `calculation-policy.ts`, 16 unit tests) |
| Contracts (`packages/contracts/src/lending.ts`) | Decision, intake, disbursement, repayment schemas |
| `DecisionsService` + `/applications/:id/review` + `/decision` | Done |
| `CustodyService` + `/assets/:id/intake` | Done |
| `LoansService` + `/loans/*` quotes & readiness | Done |
| `MoneyService` + disbursements/repayments with `Idempotency-Key` | Done |
| Transactions + payment-attempt read APIs | Done |
| Staff receipt read API + `/staff/receipts/:id` (S13-01) | Done |
| Customer `/me/loans`, `/me/receipts/:id` | Done |
| Staff web: loans, collateral, disbursement, repayment, review, transactions | Done |
| Integration tests `test/batch04.spec.ts` | 8 tests: approval, decline, intake FAIL, replay, concurrency, overpayment, receipt, role refusal |

## Verify locally

```bash
pnpm db:generate
pnpm --filter @toumua/contracts build
pnpm test:api
pnpm dev
```

The full flow can also be driven over real HTTP, which additionally exercises
routing, CSRF and sessions. The script needs the seeded staff accounts, so point
it at an API bound to the test database:

```bash
# terminal 1
cd apps/api
NODE_ENV=test DATABASE_URL=$TEST_DATABASE_URL API_PORT=3002 \
  CALCULATION_POLICY=test MAIL_DRIVER=memory SMOKE_SEED=1 \
  ../../node_modules/.bin/tsx ../../scripts/live-server.ts

# terminal 2
API_BASE=http://127.0.0.1:3002/api/v1 node scripts/smoke-batch04.mjs
```

Test accounts (passwords in `apps/api/test/helpers.ts`):

- Manager: `manager@example.com` / `Manager12345`
- Cashier: `cashier@example.com` / `Cashier12345`
- Loan officer: `loan@example.com` / `LoanOfficer12`
- Valuation officer: `val@example.com` / `Valuation12`

## Still reserved (Batch 05+)

- `/staff/corrections/*`, payment-attempt recovery UI (G01)
- Collateral return and sale (S10–S12)
- Loan default / settlement quotes (S08–S09 partial)
- Customer loan detail pages C03/C05/C06 (shell routes remain)
