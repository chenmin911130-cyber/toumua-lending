# Database mapping (Batch 01–03)

This document records the **local logical model** used for development and tests. It is **not** an ERD of the existing Railway PostgreSQL database.

## Status

| Item | Status |
| --- | --- |
| Local isolated Postgres (`toumua_dev`, `toumua_test`) | In use |
| Railway production / shared schema | **Not inspected**. No connection was opened. |
| Production migration | **Forbidden** in this phase |
| Existing customer data | Untouched |

When a read-only Railway connection is available, add a table-by-table comparison here (local column → existing column → missing constraint → non-destructive migration proposal). Do not run those migrations against the live database from this project without an explicit later decision.

## Local tables

### Auth / access (Batch 01–02)

| Table | Purpose | Notes |
| --- | --- | --- |
| `User` | Customer and staff accounts | `emailNormalized` unique; `role` nullable for admin-only bootstrap accounts |
| `Session` | HttpOnly cookie sessions | Token stored as SHA-256; `restricted` marks pending-verification sessions |
| `VerificationToken` | Verify / reset / invite | Hash only; single use; replacing a token marks the previous one used |
| `Invitation` | Staff invite record | Role comes from this row, never from the accept request body |
| `StaffPermission` | `manage_staff`, `view_audit` | Unique per user + permission; independent of business role |
| `AuditEvent` | Immutable activity | No UI edit path |
| `MailMessage` | Outbox | `ACCEPTED` only after the adapter accepts the send |
| `RateLimitHit` | Auth throttles | Login / forgot / resend |

### Lending intake (Batch 03)

| Table | Purpose | Notes |
| --- | --- | --- |
| `SequenceCounter` | `BR-*` / `APP-*` numbers | Transactional increment |
| `Borrower` | Customer profile (office record) | Distinct from `User`; searchable by name/phone |
| `BorrowerAccountLink` | One active customer ↔ borrower | Revoke sets `REVOKED`; audited |
| `Application` | Draft → submitted pipeline | Optimistic `version`; five `currentStep` values |
| `ApplicationAsset` | Security items on draft apps | Photos required before submit |
| `AssetPhoto` | Local file metadata | Files under `UPLOAD_DIR` (default `storage/uploads`) |
| `ApplicationTerms` | Repayment parameters | `policyConfigured` false blocks submit unless test policy |
| `Valuation` | Per-asset valuation | `COMPLETED` requires loan + valuation officers and borrower present |

Ledger, loan, disbursement, and repayment tables remain **Batch 04+**. Customer `GET /me/loans` still returns an authorized empty list.

## Money and policy

Official interest, fee, allocation, and default rules have not been provided. No production calculation policy is stored or selectable.
