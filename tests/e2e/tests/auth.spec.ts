import { expect, test, type APIRequestContext } from "@playwright/test";

async function waitForMailToken(request: APIRequestContext, email: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const messages = await request.get("http://127.0.0.1:8025/api/v1/messages");
    const inbox = (await messages.json()) as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    const mine = inbox.messages.find((message) =>
      message.To?.some((to) => to.Address === email),
    );
    if (mine) {
      const raw = await request.get(`http://127.0.0.1:8025/api/v1/message/${mine.ID}`);
      const body = (await raw.json()) as { Text: string };
      const token = body.Text.match(/token=([A-Za-z0-9_\-]+)/)?.[1];
      if (token) return token;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No Mailpit message for ${email}`);
}

test("customer can register, verify from mailbox API, and reach the empty home", async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("E2E Customer");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("customer-pass-12");
  await page.getByLabel("Confirm password").fill("customer-pass-12");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const token = await waitForMailToken(request, email);
  expect(token).toBeTruthy();

  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByText("Your email is verified")).toBeVisible();
  await page.getByRole("link", { name: "Continue to login" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("customer-pass-12");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("No loan is linked")).toBeVisible();
});

test("admin can invite a cashier who then signs in to staff", async ({ page, request }) => {
  await page.goto("/staff/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill("ChangeMeAdmin12");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto("/staff/admin/accounts");
  await expect(page.getByRole("heading", { name: "Staff accounts" })).toBeVisible();
  await page.getByRole("button", { name: "Invite staff" }).click();
  const email = `cashier-${Date.now()}@example.com`;
  await page.getByLabel("Name").fill("Casey");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Role").selectOption("CASHIER");
  await page.getByRole("button", { name: "Send invitation" }).click();

  const token = await waitForMailToken(request, email);
  await page.context().clearCookies();
  await page.goto(`/accept-invitation?token=${token}`);
  await page.getByLabel("Password", { exact: true }).fill("cashier-pass-12");
  await page.getByLabel("Confirm password").fill("cashier-pass-12");
  await page.getByRole("button", { name: "Activate account" }).click();
  await expect(page).toHaveURL(/staff\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("cashier-pass-12");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});
