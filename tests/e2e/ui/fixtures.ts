import { expect, test as base, type Page, type Route } from "@playwright/test";

export type UiUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  status: string;
  permissions: string[];
  emailVerified: boolean;
  restrictedSession: boolean;
  isStaff: boolean;
};

export const staffUser: UiUser = {
  id: "staff-1",
  name: "Ofa Cashier",
  email: "cashier@example.test",
  role: "CASHIER",
  status: "ACTIVE",
  permissions: [],
  emailVerified: true,
  restrictedSession: false,
  isStaff: true,
};

export const customerUser: UiUser = {
  id: "customer-1",
  name: "Sione Tama",
  email: "sione@example.test",
  role: "CUSTOMER",
  status: "ACTIVE",
  permissions: [],
  emailVerified: true,
  restrictedSession: false,
  isStaff: false,
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const baseURL = process.env.WEB_UI_BASE_URL;
    if (!baseURL) throw new Error("WEB_UI_BASE_URL missing");
    const origin = new URL(baseURL).origin;
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        await route.abort("blockedbyclient");
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        await json(route, 401, {
          code: "UNAUTHENTICATED",
          message: "Sign in required",
          requestId: "ui-unmocked",
        });
        return;
      }
      await route.continue();
    });
    await use(page);
  },
});

export { expect };

export async function mockUser(page: Page, user: UiUser | null) {
  await page.route("**/api/v1/auth/me", async (route) => {
    if (!user) {
      await json(route, 401, { code: "UNAUTHENTICATED", message: "Sign in required", requestId: "ui" });
      return;
    }
    await json(route, 200, { user });
  });
}

export function loanFixture(id = "loan-1") {
  return {
    id,
    number: "L-100",
    status: "APPROVED",
    borrowerId: "borrower-1",
    borrowerName: "Sione Tama",
    applicationId: "app-1",
    applicationNumber: "A-100",
    principal: "1000.00",
    balance: "1000.00",
    frequency: "MONTHLY",
    periods: 12,
    firstPaymentDate: "2024-08-01",
    disbursedAt: null,
    settledAt: null,
    defaultedAt: null,
    updatedAt: "2024-07-01T00:00:00.000Z",
    nextDueDate: null,
    version: 3,
    interestMethod: null,
    policy: "TEST",
    policyConfigured: true,
    overdueAmount: "0.00",
    schedule: [],
    allowedActions: [
      { id: "disburse", label: "Disburse", allowed: true },
      { id: "repay", label: "Repay", allowed: false, reason: "Not disbursed" },
    ],
  };
}

export async function mockJson(page: Page, suffix: string, status: number, body: unknown) {
  await page.route(`**${suffix}`, async (route) => {
    await json(route, status, body);
  });
}

export async function mockApi(page: Page, match: (url: URL) => boolean, status: number, body: unknown) {
  await page.route((url) => match(url), async (route) => {
    await json(route, status, body);
  });
}
