# Batch 03 report — borrowers, account link, applications, valuation, upload, terms

## Scope delivered

- Prisma models: `Borrower`, `BorrowerAccountLink`, `Application`, `ApplicationAsset`, `AssetPhoto`, `ApplicationTerms`, `Valuation`, `SequenceCounter`
- Migration: `20260917100000_batch_03_lending`
- Contracts: `packages/contracts/src/lending.ts`
- API module: `apps/api/src/lending/*` (borrowers, applications, valuations, uploads)
- Customer APIs: `/me/applications`, `/me/applications/:id` (linked borrower, non-draft only)
- Staff search: borrowers / applications / assets
- Web: S02 borrowers, S17 account link, S03 applications, S04 wizard, S05 valuation, C04 customer progress

## Pass criteria

| Criterion | Status |
| --- | --- |
| Draft survives refresh | Pass (`APP-01`) |
| Submit blocked until readiness complete | Pass (`APP-01`) |
| Optimistic version conflict (409) | Pass (`APP-01`) |
| Account link one-to-one | Pass (`LINK-01`) |
| Customer sees submitted applications only | Pass (`LINK-01`) |
| Photo upload + terms (test policy) | Pass (`LINK-01`) |
| Valuation completion with participation | Pass (`LINK-01`) |

## Tests

```bash
cd apps/api
NODE_ENV=test CALCULATION_POLICY=test pnpm test
```

Result: **15/15 passed** (13 existing + 2 new lending specs).

## Local setup notes

1. Apply migration (if not already):

   ```bash
   pnpm --filter @toumua/api prisma:migrate
   ```

2. Rebuild contracts after schema/API changes:

   ```bash
   pnpm --filter @toumua/contracts build
   ```

3. Regenerate Prisma client:

   ```bash
   pnpm --filter @toumua/api prisma:generate
   ```

4. Start stack from system Terminal:

   ```bash
   pnpm dev
   ```

5. Test-only calculation preview: set `CALCULATION_POLICY=test` (never use in production).

## Not in Batch 03

Approval, collateral intake, disbursement, repayment, loans, and manager decision flows remain Batch 04+.
