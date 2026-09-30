import { expect, loanFixture, mockJson, mockUser, staffUser, test } from "./fixtures";

const correction = {
  id: "cor-1",
  status: "PENDING",
  version: 2,
  originalLedgerEntryId: "led-1",
  originalTransaction: {
    id: "tx-1",
    loanId: "loan-1",
    loanNumber: "L-100",
    borrowerName: "Sione Tama",
    type: "REPAYMENT",
    amount: "100.00",
    businessDate: "2024-07-01",
    method: "CASH",
    externalReference: null,
    note: null,
    postedBy: "Ofa",
    createdAt: "2024-07-01T00:00:00.000Z",
    receiptId: null,
    receiptNumber: null,
  },
  proposedValues: {
    amount: "80.00",
    businessDate: "2024-07-02",
    method: "CASH",
    note: "Counted short",
  },
  reason: "Wrong amount entered",
  requestedBy: "Ofa Cashier",
  decidedBy: null,
  decisionReason: null,
  reversalEntryId: null,
  replacementEntryId: null,
  createdAt: "2024-07-03T00:00:00.000Z",
  updatedAt: "2024-07-03T00:00:00.000Z",
  allowedActions: [
    { id: "decide", label: "Decide", allowed: true },
    { id: "post", label: "Post", allowed: false, reason: "Not approved" },
  ],
};

test("money pages show an error and retry instead of staying on Loading", async ({ page }) => {
  await mockUser(page, staffUser);
  let open = false;
  await page.route("**/api/v1/loans/loan-1/disbursement-readiness", async (route) => {
    await route.fulfill({
      status: open ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(open
        ? { ready: true, items: [{ id: "stored", label: "Assets stored", complete: true }] }
        : { code: "ERROR", message: "Readiness failed", requestId: "ui" }),
    });
  });
  await page.route("**/api/v1/loans/loan-1", async (route) => {
    if (route.request().url().includes("disbursement-readiness")) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: open ? 200 : 403,
      contentType: "application/json",
      body: JSON.stringify(open
        ? loanFixture()
        : { code: "FORBIDDEN", message: "You cannot view this loan", requestId: "ui" }),
    });
  });

  await page.goto("/staff/loans/loan-1/disbursement");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("You cannot view this loan");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Disbursement" })).toHaveCount(0);

  open = true;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "Disbursement" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm disbursement" })).toBeVisible();

  await mockJson(page, "/api/v1/loans/loan-9", 404, {
    code: "NOT_FOUND",
    message: "Loan not found",
    requestId: "ui",
  });
  await page.goto("/staff/loans/loan-9/default");
  await expect(page.getByRole("alert")).toContainText("Loan not found");
  await expect(page.getByText("Loading…")).toHaveCount(0);
});

test("correction detail shows proposed values before approval", async ({ page }) => {
  await mockUser(page, staffUser);
  let open = false;
  await page.route("**/api/v1/corrections/cor-1", async (route) => {
    await route.fulfill({
      status: open ? 200 : 500,
      contentType: "application/json",
      body: JSON.stringify(open
        ? correction
        : { code: "ERROR", message: "Could not load correction", requestId: "ui" }),
    });
  });
  await page.goto("/staff/corrections/cor-1");
  await expect(page.getByRole("alert")).toContainText("Could not load correction");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  open = true;
  await page.getByRole("button", { name: "Retry" }).click();
  const main = page.locator("main");
  await expect(main.getByRole("region", { name: "Proposed correction" })).toBeVisible();
  await expect(main.getByText("80.00")).toBeVisible();
  await expect(main.getByText("2024-07-02")).toBeVisible();
  await expect(main.getByText("Counted short")).toBeVisible();
  await expect(main.getByText("CASH")).toBeVisible();
  await expect(main).toContainText("Only repayment corrections can be approved and posted");
  await expect(main).toContainText("not treated as repayments");
  const text = await main.innerText();
  expect(text.indexOf("80.00")).toBeLessThan(text.indexOf("Approve"));
});

test("a late disbursement response does not replace the page after going back", async ({ page }) => {
  await mockUser(page, staffUser);
  await mockJson(page, "/api/v1/loans/loan-1", 200, loanFixture());
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/loans/loan-1/disbursement-readiness", async (route) => {
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ready: true, items: [] }),
    });
  });
  await page.goto("/staff/loans/loan-1");
  await page.getByRole("link", { name: "Disbursement" }).click();
  await expect(page.getByRole("status")).toHaveText("Loading…");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "L-100" })).toBeVisible();
  release();
  await page.waitForTimeout(300);
  await expect(page.getByRole("heading", { name: "L-100" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm disbursement" })).toHaveCount(0);
});
