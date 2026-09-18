#!/usr/bin/env node
/**
 * Live end-to-end smoke of the documented Batch 04 flow.
 *
 * Unlike the vitest suite (which drives the Nest app in-process), this talks to
 * a real listening server over HTTP with real cookies, so it also proves the
 * routing, CSRF and session handling a browser would hit.
 *
 * It expects the seeded staff accounts, so point it at an API whose database
 * has them (the test database), not a fresh dev database:
 *
 *   API_BASE=http://127.0.0.1:3002/api/v1 node scripts/smoke-batch04.mjs
 *
 * Start that server with, for example:
 *   cd apps/api
 *   NODE_ENV=test DATABASE_URL=$TEST_DATABASE_URL API_PORT=3002 \
 *     CALCULATION_POLICY=test MAIL_DRIVER=memory \
 *     ../../node_modules/.bin/tsx ../../scripts/live-server.ts
 */

const API = process.env.API_BASE ?? "http://127.0.0.1:3001/api/v1";
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let failures = 0;
function check(label, expected, actual) {
  const ok = String(expected) === String(actual);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? ` (${actual})` : `: expected ${expected}, got ${actual}`}`);
}

/** Minimal cookie-jar client: one instance per logged-in session. */
function client() {
  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  function absorb(response) {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }
  async function csrf() {
    const response = await fetch(`${API}/auth/csrf`, { headers: { cookie: cookieHeader() } });
    absorb(response);
    return (await response.json()).token;
  }
  return {
    async request(method, path, body, headers = {}) {
      const token = await csrf();
      const response = await fetch(`${API}${path}`, {
        method,
        headers: {
          cookie: cookieHeader(),
          "x-csrf-token": token,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      absorb(response);
      const text = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      return { status: response.status, body: parsed };
    },
    get(path) {
      return this.request("GET", path);
    },
    post(path, body, headers) {
      return this.request("POST", path, body ?? {}, headers);
    },
    put(path, body) {
      return this.request("PUT", path, body);
    },
    patch(path, body) {
      return this.request("PATCH", path, body);
    },
    async upload(path) {
      const token = await csrf();
      const form = new FormData();
      form.append("file", new Blob([PNG_HEADER], { type: "image/png" }), "photo.png");
      const response = await fetch(`${API}${path}`, {
        method: "POST",
        headers: { cookie: cookieHeader(), "x-csrf-token": token },
        body: form,
      });
      absorb(response);
      return { status: response.status, body: await response.json().catch(() => ({})) };
    },
  };
}

async function login(email, password) {
  const session = client();
  const response = await session.post("/auth/login", { email, password });
  return { session, response };
}

async function main() {
  console.log(`== against ${API} ==`);

  console.log("== login ==");
  const loanLogin = await login("loan@example.com", "LoanOfficer12");
  check("loan officer login", 201, loanLogin.response.status);
  const cashierLogin = await login("cashier@example.com", "Cashier12345");
  check("cashier login", 201, cashierLogin.response.status);
  const managerLogin = await login("manager@example.com", "Manager12345");
  check("manager login", 201, managerLogin.response.status);
  const valLogin = await login("val@example.com", "Valuation12");
  check("valuation officer login", 201, valLogin.response.status);
  if (failures > 0) {
    console.log("\nCannot continue without the seeded staff accounts. Is the API bound to the test database?");
    return 1;
  }
  const loan = loanLogin.session;
  const cashier = cashierLogin.session;
  const manager = managerLogin.session;
  const val = valLogin.session;

  console.log("== prepare application ==");
  const borrower = await loan.post("/borrowers", {
    name: "Live Borrower",
    phone: "+64 21 555 0404",
    address: "9 Queen Street, Auckland",
  });
  check("create borrower", 201, borrower.status);
  const application = await loan.post("/applications", { borrowerId: borrower.body.id });
  check("create application", 201, application.status);
  const appId = application.body.id;
  const details = await loan.patch(`/applications/${appId}`, {
    expectedVersion: application.body.version,
    requestedAmount: "600.00",
    purpose: "Emergency repair",
    proposedTermMonths: 6,
  });
  check("save loan details", 200, details.status);
  const withAsset = await loan.post(`/applications/${appId}/assets`, {
    name: "Watch",
    description: "Steel wristwatch",
    condition: "Good",
  });
  check("add asset", 201, withAsset.status);
  const assetId = withAsset.body.assets[0].id;
  const photo = await loan.upload(`/applications/${appId}/assets/${assetId}/photos`);
  check("upload photo", 201, photo.status);
  const latest = await loan.get(`/applications/${appId}`);
  const terms = await loan.put(`/applications/${appId}/terms`, {
    expectedVersion: latest.body.version,
    firstPaymentDate: "2026-10-01",
    frequency: "MONTHLY",
    periods: 6,
  });
  check("save terms", 200, terms.status);

  const valuations = await loan.get(`/applications/${appId}/valuations`);
  const me = await loan.get("/auth/me");
  const valMe = await val.get("/auth/me");
  const completed = await val.post(`/valuations/${valuations.body.items[0].id}/complete`, {
    expectedVersion: 1,
    amount: "400.00",
    valuationDate: "2026-09-18",
    basis: "Comparable sales",
    borrowerPresent: true,
    loanOfficerId: me.body.user.id,
    valuationOfficerId: valMe.body.user.id,
    participatedAt: "2026-09-18T10:00:00.000Z",
  });
  check("complete valuation", 201, completed.status);
  const ready = await loan.get(`/applications/${appId}`);
  const submitted = await loan.post(`/applications/${appId}/submit`, {
    expectedVersion: ready.body.version,
  });
  check("submit application", 201, submitted.status);

  console.log("== manager approval ==");
  const review = await manager.get(`/applications/${appId}/review`);
  check("review readable", 200, review.status);
  check("canApprove", true, review.body.canApprove);
  const approved = await manager.post(`/applications/${appId}/decision`, {
    expectedVersion: review.body.version,
    decision: "approve",
    reviewed: true,
  });
  check("approve application", 201, approved.status);
  const loanId = approved.body.loanId;

  console.log("== collateral intake (valuation officer) ==");
  const beforeIntake = await loan.get(`/loans/${loanId}`);
  const assetRead = await val.get(`/assets/${assetId}`);
  check("valuation officer can read asset", 200, assetRead.status);
  const intake = await val.post(`/assets/${assetId}/intake`, {
    expectedVersion: beforeIntake.body.version,
    receivedOn: "2026-09-18",
    inspectedOn: "2026-09-18",
    inspectionResult: "PASS",
    location: "Vault A",
  });
  check("confirm intake", 201, intake.status);
  check("asset STORED", "STORED", intake.body.status);

  console.log("== disbursement (cashier) ==");
  const readiness = await cashier.get(`/loans/${loanId}/disbursement-readiness`);
  check("ready for disbursement", true, readiness.body.ready);
  const forDisburse = await cashier.get(`/loans/${loanId}`);
  const disburseBody = {
    expectedVersion: forDisburse.body.version,
    businessDate: "2026-09-18",
    method: "CASH",
  };
  const disbursed = await cashier.post(`/loans/${loanId}/disbursements`, disburseBody, {
    "idempotency-key": "live-disburse-1",
  });
  check("disburse", 201, disbursed.status);
  const disbursementReplay = await cashier.post(
    `/loans/${loanId}/disbursements`,
    disburseBody,
    { "idempotency-key": "live-disburse-1" },
  );
  check("disbursement replay", 201, disbursementReplay.status);
  check("replay returns the same receipt", disbursed.body.receiptNumber, disbursementReplay.body.receiptNumber);

  console.log("== repayment (cashier) ==");
  const active = await cashier.get(`/loans/${loanId}`);
  check("loan is ACTIVE", "ACTIVE", active.body.status);
  const repayBody = {
    expectedVersion: active.body.version,
    amount: "100.00",
    businessDate: "2026-10-01",
    method: "CASH",
  };
  const repaid = await cashier.post(`/loans/${loanId}/repayments`, repayBody, {
    "idempotency-key": "live-repay-1",
  });
  check("repay", 201, repaid.status);
  check("balance after repayment", "500.00", repaid.body.balanceAfter);
  const repayReplay = await cashier.post(`/loans/${loanId}/repayments`, repayBody, {
    "idempotency-key": "live-repay-1",
  });
  check("repayment replay", 201, repayReplay.status);
  check("replay reports the same balance", "500.00", repayReplay.body.balanceAfter);
  const afterReplay = await cashier.get(`/loans/${loanId}`);
  check("balance unchanged by the replay", "500.00", afterReplay.body.balance);

  console.log("== ledger and receipts ==");
  const transactions = await cashier.get("/transactions");
  check("transactions list", 200, transactions.status);
  const types = transactions.body.items.map((row) => row.type).sort();
  check("ledger holds one disbursement and one repayment", "DISBURSEMENT,REPAYMENT", types.join(","));
  const transaction = await manager.get(`/transactions/${transactions.body.items[0].id}`);
  check("transaction detail", 200, transaction.status);
  const receiptId = transactions.body.items.find((row) => row.receiptId)?.receiptId;
  const receipt = await cashier.get(`/receipts/${receiptId}`);
  check("receipt readable by staff", 200, receipt.status);

  console.log("== correction workflow (cashier requests, manager approves) ==");
  // The loan is ACTIVE with 500.00 outstanding here. Correct the 100.00 payment
  // up to 120.00 and confirm the balance and the plan both follow the ledger.
  const beforeCorrection = await cashier.get(`/loans/${loanId}`);
  const requested = await cashier.post("/corrections", {
    originalLedgerEntryId: repaid.body.ledgerEntryId,
    reason: "Wrong amount entered at the counter",
    proposedValues: { amount: "120.00", businessDate: "2026-10-01", method: "CASH" },
  });
  check("cashier requests a correction", 201, requested.status);
  check("correction starts REQUESTED", "REQUESTED", requested.body.status);
  const decided = await manager.post(`/corrections/${requested.body.id}/decision`, {
    expectedVersion: requested.body.version,
    decision: "approve",
  });
  check("manager approves the correction", 201, decided.status);
  const postedCorrection = await cashier.post(
    `/corrections/${requested.body.id}/post`,
    {},
    { "idempotency-key": "live-correction-1" },
  );
  check("cashier posts the correction", 201, postedCorrection.status);
  const corrected = await cashier.get(`/loans/${loanId}`);
  check("balance follows the corrected amount", "480.00", corrected.body.balance);
  check("loan stays ACTIVE after the correction", "ACTIVE", corrected.body.status);

  console.log("== default, sale and return ==");
  const beforeDefault = await cashier.get(`/loans/${loanId}`);
  const defaulted = await manager.post(`/loans/${loanId}/default`, {
    expectedVersion: beforeDefault.body.version,
    businessDate: "2026-09-20",
    reason: "Missed installments",
    policyBasis: "Office default policy clause 4",
  });
  check("manager declares default", 201, defaulted.status);
  check("loan DEFAULTED", "DEFAULTED", defaulted.body.status);

  const afterDefault = await cashier.get(`/loans/${loanId}`);
  const sold = await val.post(`/assets/${assetId}/sale`, {
    expectedVersion: afterDefault.body.version,
    buyerName: "Second-hand dealer",
    buyerContact: "+64 21 555 0404",
    // Deliberately more than the debt: a surplus is normal and must be recordable.
    saleAmount: "900.00",
    saleDate: "2026-09-21",
    method: "Private sale",
    notes: "Auction preview",
  });
  check("valuation officer records the sale", 201, sold.status);
  check("asset SOLD", "SOLD", sold.body.status);

  const forSaleReceipt = await cashier.get(`/loans/${loanId}`);
  const saleReceipt = await cashier.post(
    `/loans/${loanId}/sale-receipts`,
    {
      expectedVersion: forSaleReceipt.body.version,
      amount: "900.00",
      businessDate: "2026-09-21",
      method: "CASH",
    },
    { "idempotency-key": "live-sale-1" },
  );
  check("cashier records sale proceeds", 201, saleReceipt.status);
  check("surplus over the debt is kept", "420.00", saleReceipt.body.surplus);
  check("balance cleared by the sale", "0.00", saleReceipt.body.balanceAfter);

  const recovered = await cashier.get(`/loans/${loanId}`);
  check("full recovery settles the loan", "SETTLED", recovered.body.status);

  const returned = await val.post(`/assets/${assetId}/return`, {
    expectedVersion: recovered.body.version,
    returnedOn: "2026-09-22",
    recipientName: "Live Borrower",
    verificationMethod: "Photo ID checked",
    identityConfirmed: true,
  });
  // This asset was sold, so it must never be handed back: returning it would
  // put collateral back with the borrower while the proceeds were also taken.
  check("return is refused for a sold asset", 422, returned.status);
  const afterReturnAttempt = await val.get(`/assets/${assetId}`);
  check("asset stays SOLD", "SOLD", afterReturnAttempt.body.status);

  console.log("== G01 unresolved attempts ==");
  const unresolved = await cashier.get("/payment-attempts?status=unresolved&mine=true");
  check("cashier can list unresolved attempts", 200, unresolved.status);
  check("nothing unresolved after clean postings", 0, unresolved.body.items.length);

  console.log();
  if (failures === 0) {
    console.log("ALL LIVE CHECKS PASSED");
    return 0;
  }
  console.log(`${failures} LIVE CHECK(S) FAILED`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error("SMOKE ERROR", error);
    process.exit(1);
  },
);
