# Route list (Batch 01–03)

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
| `/customer/loans` | C09/C10 | Empty authorized list |
| `/customer/loans/:loanId` | C03/C08 | Reserved shell |
| `/customer/loans/:loanId/repayments` | C05 | Reserved shell |
| `/customer/loans/:loanId/security/:assetId?` | C06 | Reserved shell |
| `/staff` | S01 | Shell only |
| `/staff/admin/accounts` | S16 | Implemented |
| `/staff/admin/activity` | S19 | Implemented |
| `/staff/borrowers` (+ new/edit) | S02/S20 | Implemented |
| `/staff/borrowers/:id/account-link` | S17 | Implemented |
| `/staff/applications` | S03 | Implemented |
| `/staff/applications/:id/edit/:step` | S04/S21/S15/S22 | Implemented (5-step wizard) |
| `/staff/applications/:id/valuation` | S05 | Implemented |
| Remaining `/staff/*` business routes | S06–S15, S18, G01 | Auth-gated reserved shells |
