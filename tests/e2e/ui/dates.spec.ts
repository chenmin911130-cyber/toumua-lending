import { expect, loanFixture, mockApi, mockJson, mockUser, staffUser, test } from "./fixtures";

test("business date inputs and due-today use Pacific/Auckland", async ({ page }) => {
  const today = process.env.WEB_UI_EXPECTED_DATE;
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const yesterday = shiftDate(today!, -1);
  await mockUser(page, staffUser);
  await mockJson(page, "/api/v1/loans/loan-1/disbursement-readiness", 200, {
    ready: false,
    items: [{ id: "stored", label: "Assets stored", complete: false, detail: "Waiting" }],
  });
  await mockJson(page, "/api/v1/loans/loan-1", 200, loanFixture());
  await mockApi(page, (url) => url.pathname === "/api/v1/loans", 200, {
    items: [
      {
        ...loanFixture("due"),
        number: "L-DUE",
        status: "ACTIVE",
        nextDueDate: `${today}T00:00:00.000Z`,
      },
      {
        ...loanFixture("old"),
        number: "L-OLD",
        status: "ACTIVE",
        nextDueDate: `${yesterday}T00:00:00.000Z`,
      },
    ],
    total: 2,
    nextCursor: null,
  });
  await mockApi(page, (url) => url.pathname === "/api/v1/applications", 200, { items: [], total: 0, nextCursor: null });
  await mockApi(page, (url) => url.pathname === "/api/v1/transactions", 200, { items: [], total: 0, nextCursor: null });

  await page.goto("/staff/loans/loan-1/disbursement");
  await expect(page.getByLabel("Business date")).toHaveValue(today!);

  await page.goto("/staff/loans/loan-1/default");
  await expect(page.getByLabel("Default date")).toHaveValue(today!);

  await page.goto("/staff");
  await expect(page.locator("article", { hasText: "Due today" }).locator(".metric-value")).toHaveText("1");
});

function shiftDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
