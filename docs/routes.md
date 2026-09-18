# Route list (Batch 01–05)

| Route | Page | Status |
| --- | --- | --- |
| `/` | C01 | Implemented |
| `/login` | C02 | Implemented |
| `/staff/login` | C02 staff | Implemented |
| `/register` | A03 | Implemented |
| `/verify-email/pending` | A04 | Implemented |
| `/verify-email` | A05 | Implemented |
| `/forgot-password` | A01 | Implemented |
| `/reset-password` | A07 | Implemented |
| `/accept-invitation` | A06 | Implemented |
| `/help` | C07 | Implemented |
| `/account` | A02 | Implemented |
| `/customer` | C10 when no loans | Implemented empty |
| `/customer/applications` | C04 | List + empty state |
| `/customer/applications/:id` | C04 | Progress stages |
| `/customer/loans` | C09/C10 | Linked borrower loans (disbursed+) |
| `/customer/loans/:loanId` | C03/C08 | Implemented |
| `/customer/loans/:loanId/repayments` | C05 | Implemented (schedule + receipt history) |
| `/customer/loans/:loanId/security/:assetId?` | C06 | Implemented |
| `/customer/receipts/:id` | C05 receipt detail | Implemented |
| `/staff` | S01 | Implemented (live metrics + queues) |
| `/staff/admin/accounts` | S16 | Implemented |
| `/staff/admin/activity` | S19 | Implemented |
| `/staff/borrowers` (+ new/edit) | S02/S20 | Implemented |
| `/staff/borrowers/:id/account-link` | S17 | Implemented |
| `/staff/applications` | S03 | Implemented |
| `/staff/applications/:id/edit/:step` | S04/S21/S15/S22 | Implemented (5-step wizard) |
| `/staff/applications/:id/valuation` | S05 | Implemented |
| `/staff/applications/:id/review` | S06 manager review | Implemented |
| `/staff/loans` (+ detail, disbursement, repayment) | S08–S10 | Implemented |
| `/staff/collateral` (+ detail intake) | S07 | Implemented |
| `/staff/transactions` (+ detail) | S11 | Implemented |
| `/staff/receipts/:id` | S13-01 receipt drawer | Implemented |
| `/staff/loans/:id/default` | S08-06 manager default | Implemented |
| `/staff/loans/:id/sale-receipt` | S12 cashier sale proceeds | Implemented |
| `/staff/collateral/:id/return` | S11 return | Implemented |
| `/staff/collateral/:id/sale` | S12 sale record | Implemented |
| `/staff/corrections`, `/staff/corrections/:id` | S18 | Implemented |
| `/staff/payment-attempts/:id` | G01 recovery | Implemented |
| `/notifications` | G02 | Implemented (empty state until events are wired) |
