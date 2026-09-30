import { customerUser, expect, mockJson, mockUser, staffUser, test, type UiUser } from "./fixtures";

const notes = {
  items: [{
    id: "n1",
    title: "Office update",
    body: "A staff member recorded a change.",
    href: null,
    read: false,
    createdAt: "2024-07-01T00:00:00.000Z",
  }],
  unread: 1,
  total: 1,
};

test("staff and customer notifications use the matching shell", async ({ page }) => {
  await mockJson(page, "/api/v1/notifications", 200, notes);

  await mockUser(page, staffUser);
  await page.goto("/notifications");
  await expect(page.locator("[data-shell=staff]")).toBeVisible();
  await expect(page.locator("[data-shell=customer]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "My overview" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/notifications$/);

  await page.goto("/staff/notifications");
  await expect(page.locator("[data-shell=staff]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();

  await mockUser(page, customerUser);
  await page.goto("/notifications");
  await expect(page.locator("[data-shell=customer]")).toBeVisible();
  await expect(page.locator("[data-shell=staff]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "My overview" })).toBeVisible();

  await page.goto("/staff/notifications");
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.locator("[data-shell=customer]")).toBeVisible();
  await expect(page.getByText("Lending workspace")).toHaveCount(0);
});

test("loading and restricted sessions do not fetch notifications or loop", async ({ page }) => {
  let notificationCalls = 0;
  await page.route("**/api/v1/notifications**", async (route) => {
    notificationCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(notes),
    });
  });

  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/auth/me", async (route) => {
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: staffUser }),
    });
  });
  await page.goto("/notifications");
  await expect(page.getByRole("status")).toHaveText("Loading session…");
  expect(notificationCalls).toBe(0);
  await expect(page).toHaveURL(/\/notifications$/);
  release();
  await expect(page.locator("[data-shell=staff]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();

  const afterStaff = notificationCalls;
  expect(afterStaff).toBeGreaterThan(0);
  await mockUser(page, { ...customerUser, restrictedSession: true, emailVerified: false });
  await page.goto("/notifications");
  await expect(page).toHaveURL(/\/verify-email\/pending$/);
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/\/verify-email\/pending$/);
  expect(notificationCalls).toBe(afterStaff);

  await mockUser(page, null);
  await page.goto("/staff/notifications");
  await expect(page).toHaveURL(/\/staff\/login$/);
  await page.goto("/notifications");
  await expect(page).toHaveURL(/\/login$/);
  expect(notificationCalls).toBe(afterStaff);
});

test("restricted staff session is not shown the staff notification list", async ({ page }) => {
  let notificationCalls = 0;
  await page.route("**/api/v1/notifications**", async () => {
    notificationCalls += 1;
  });
  const restricted: UiUser = { ...staffUser, restrictedSession: true };
  await mockUser(page, restricted);
  await page.goto("/staff/notifications");
  await expect(page).toHaveURL(/\/verify-email\/pending$/);
  expect(notificationCalls).toBe(0);
});
