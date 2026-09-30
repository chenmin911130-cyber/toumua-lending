# Toumu’a Lending — Demo walkthrough (registration to disbursement)

English guide for **Profile B**: staff create applications in the office; customers register only to **view progress**, sign contracts, and see loans after **account link**.

**Local URLs**

| App | URL |
|-----|-----|
| Public / customer login | http://127.0.0.1:5173/login |
| Staff login | http://127.0.0.1:5173/staff/login |
| API (via web proxy) | http://127.0.0.1:5173/api/v1 |

**Prepare demo data**

```bash
pnpm db:migrate:deploy   # if needed
pnpm seed:demo           # staff + demo customers @toumua.nz
```

Shared password for all seeded staff accounts: **`project721`**

---

## Demo accounts (seeded)

### Staff (use `/staff/login`)

| Role | Email | Name | Typical use in demo |
|------|--------|------|---------------------|
| Loan officer | `staff@toumua.nz` | Louise Staff | Applications wizard, submit |
| Loan officer | `loan.officer2@toumua.nz` | Jordan Loan | Contract sign-in-branch dropdown |
| Loan officer | `loan.officer3@toumua.nz` | Priya Rao | Same |
| Manager | `manager@toumua.nz` | Morgan Manager | Approve / decline, issue contract |
| Valuation officer | `valuation@toumua.nz` | Sam Valuer | Valuation queue, collateral intake |
| Valuation officer | `valuation2@toumua.nz` | Hana Apelu | Dropdowns |
| Valuation officer | `valuation3@toumua.nz` | Chris Field | Dropdowns |
| Cashier | `cashier@toumua.nz` | Tui Cashier | Disbursement, repayments |
| Workspace admin | `admin@toumua.nz` | Workspace Admin | Staff accounts (not lending) |
| Owner | `owner@toumua.nz` | Alice Owner | Business status (optional) |
| Accountant | `accountant@toumua.nz` | Ken Accountant | Reports (optional) |
| Cashier | (see above) | Tui Cashier | Money posting |

### Demo customers (seeded, `/login`)

Password: **`project721`**. Examples: `sarah.tama@toumua.nz`, `david.chen@toumua.nz`, etc. (see `pnpm seed:demo` output).

### Your own test customer

Register at `/register` with any email (e.g. personal QQ email). Verify email (Mailpit or **Verify here** on pending page). Staff must **link** that login to a borrower before the customer sees applications/loans.

---

## End-to-end flow

```text
Customer register + verify
        ↓
Staff: borrower + link account
        ↓
Staff: application wizard → submit
        ↓
Manager: review → approve (creates loan + contract ISSUED)
        ↓
Customer: sign contract  OR  staff: Sign in branch
        ↓
Valuation officer: collateral intake (STORED)
        ↓
Cashier: disbursement → loan ACTIVE
        ↓
Customer: My loans / repayments
```

---

### 1. Customer registration (portal)

1. Open **http://127.0.0.1:5173/register**.
2. Complete registration (password at least 12 characters).
3. Verify email (dev: Mailpit or in-app verify link).
4. Customer can use **Application progress** after link; they do **not** self-apply when Profile B is enabled.

---

### 2. Staff — borrower and account link

Login: **`staff@toumua.nz`** / `project721`

1. **Borrowers** → **Add borrower** (name, phone, address, email matching the customer login).
2. Open borrower → **Link account** → search customer email → confirm identity → **Confirm link**.

---

### 3. Staff — application (wizard)

**Applications** → **New application**

| Step | What to complete |
|------|------------------|
| 1. Borrower | Select linked borrower (check “login linked”). |
| 2. Loan details | Amount, purpose, term → save. |
| 3. Security assets | Add asset(s); **Add photo** each; **Save valuation** (amount ≥ loan) or use **Valuations** queue. |
| 4. Repayment terms | First payment date, frequency, periods → **Save terms** → optional **Preview schedule**. |
| 5. Review | All checks ✓ → **Submit for review**. |

Valuation officers use **Valuations** (`/staff/valuations`), not the full applications list.

---

### 4. Manager — decision

Login: **`manager@toumua.nz`**

1. **Applications** (filter **Submitted**) or home **Pending reviews**.
2. Open application → **Review** → **Approve** (or Decline).
3. System creates **Loan** (`APPROVED_UNFUNDED`), **repayment schedule**, and **contract** (`ISSUED`).

Optional: **Loans** → loan → **Open contract** if contract must be re-issued.

---

### 5. Contract signature

**Customer** (`/login`):

1. **My loans** → **Sign contract** (or **Open loan** → **Review and sign contract**).
2. Scroll contract, name, signature, consent → **Sign contract**.

**Staff alternative** (customer in branch):

1. **Loans** → loan → **Open contract**.
2. **Sign in branch** (loan officer or manager).

Disbursement requires contract status **SIGNED**.

---

### 6. Valuation officer — collateral storage

Login: **`valuation@toumua.nz`**

1. **Collateral** → open each security asset for the loan.
2. **Intake**: received / inspected **PASS**, choose **storage location** → save until status **STORED**.
3. Every asset on the application must be **STORED** before disbursement.

---

### 7. Cashier — disbursement

Login: **`cashier@toumua.nz`**

1. **Loans** → open loan (`APPROVED_UNFUNDED`).
2. **Disbursement checklist** — all items ✓:
   - Loan awaiting disbursement  
   - All security assets stored  
   - Loan contract signed  
   - No disbursement recorded  
3. **Confirm disbursement** → receipt; loan becomes **ACTIVE**.

Later: **Repayment** on the same loan for instalments.

---

## Quick role cheat sheet

| Need to… | Role | Where |
|----------|------|--------|
| Create application | Loan officer | Applications |
| Complete field valuation (draft) | Loan officer or valuer | Security step or Valuations |
| Approve loan | Manager | Application review |
| Sign contract (online) | Customer | My loans → Sign contract |
| Sign contract (branch) | Loan officer / Manager | Staff contract page |
| Store collateral | Valuation officer | Collateral → Intake |
| Release funds | Cashier | Loans → Disbursement |
| Record payment | Cashier | Loans → Repayment |

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| Customer **My loans** empty | **Link account** on borrower |
| Valuation queue empty | Restart API; open `/staff/valuations` |
| No **Sign contract** button | Open loan detail; hard refresh; contract must be `ISSUED` |
| Cashier no disbursement checklist | Use **Disbursement checklist** on `APPROVED_UNFUNDED` loan |
| Submit blocked on Review | Each asset: ≥1 photo + completed valuation; valuation ≥ loan amount |

---

## Environment notes

- **Profile B**: `FEATURE_CUSTOMER_SELF_APPLY=0` / `VITE_FEATURE_CUSTOMER_SELF_APPLY=0` — no customer self-apply wizard.
- After pulling API changes, restart: `pnpm dev:api` (and `pnpm dev:web` if needed).
- Demo password for seeded accounts: **`project721`**.
