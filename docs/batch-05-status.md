# Batch 05: default, return, sale, corrections, G01

Status: **implemented** (API + staff web). Customer loan detail pages (C03/C05/C06) and production settlement policy remain later batches.

## Delivered

| Item | State |
| --- | --- |
| Migration `20260918120000_batch_05_corrections_disposal` | Applied |
| `CorrectionRequest` model + `PaymentAttemptType.SALE_RECEIPT` | Done |
| Contracts: default, return, sale, sale-receipt, correction, settlement quote | Done |
| `POST /loans/:id/default` | Manager declares default on active loans |
| `POST /assets/:id/return` | Valuation officer returns settled collateral |
| `POST /assets/:id/sale`, `/sale-draft` | Valuation officer records disposal |
| `POST /loans/:id/sale-receipts` | Cashier records sale proceeds (idempotent) |
| `GET /loans/:id/quotes?type=settlement` | Shows proceeds vs balance; pending without production policy |
| Corrections API `/corrections/*` | Request → approve/reject → post |
| `GET /payment-attempts?status=unresolved&mine=true` | G01 unresolved list |
| Staff web: default, sale, return, corrections, payment-attempt recovery | Done |
| Integration tests `test/batch05.spec.ts` | 11 tests |

## Review fixes (found by probing the money math)

The first cut of this batch recorded corrections and sale proceeds in the ledger
but never moved the loan, so the books and the loan disagreed. Fixed:

| Defect | Now |
| --- | --- |
| Posting a correction wrote reversal/replacement ledger rows but left the plan and balance untouched | The correction delta is applied to the schedule (withdrawing the original allocation first, then applying the corrected amount in due order) and the loan settles or reopens to match |
| Correcting a settled loan downward left it SETTLED with a debt | The loan reopens to ACTIVE, and the return guard then correctly blocks the collateral |
| Sale proceeds above the outstanding balance were refused as "overpayment", which rejects a real sale amount | Proceeds are charged to the plan up to the balance; the remainder is reported as `surplus` and awaits the official settlement policy |
| A sale that recovered the whole debt left the loan DEFAULTED forever, so the collateral could never be returned | Full recovery sets the loan SETTLED |
| Two simultaneous correction decisions both landed (approve and reject) | Decision is a conditional write; the loser gets 409 and only one version bump is spent |
| `POST /loans/:id/default` checked the version outside the write | Conditional write, same as repayments and corrections |
| A correction could propose more than the plan ever held | Refused at post time; the failed post leaves the loan unchanged |

## Verify locally

```bash
pnpm db:generate
pnpm --filter @toumua/contracts build
pnpm test:api
pnpm dev
```

The full flow (Batch 04 and 05) can also be driven over real HTTP with
`scripts/smoke-batch04.mjs`; see `docs/batch-04-status.md` for how to start the
seed-capable server it needs.

## Still reserved (Batch 06+)

- Official settlement/surplus policy and `POST settlement-actions` (blocked on client rates)
- Customer loan pages, notifications, search, print, and CSV are now implemented in later work.
