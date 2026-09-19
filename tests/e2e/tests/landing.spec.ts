import { expect, test } from "@playwright/test";

test("landing apply CTAs go to /login and FAQ goes to /help", async ({ page }) => {
  await page.goto("/");

  const primaryCta = page.getByRole("link", { name: "Check my options" });
  await expect(primaryCta).toHaveAttribute("href", "/login");

  const mainNav = page.getByRole("navigation", { name: "Main" });
  await expect(mainNav.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/login");
  await expect(mainNav.getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "/help");
  await expect(mainNav.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/help");
  await expect(mainNav.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");

  await expect(page.getByRole("contentinfo").getByRole("link", { name: "FAQ" })).toHaveAttribute(
    "href",
    "/help",
  );
  await expect(page.getByRole("link", { name: "Talk to us" }).first()).toHaveAttribute("href", "/help");

  const bottomCta = page.locator("section.bg-primary").getByRole("link", { name: "Get started" });
  await expect(bottomCta).toHaveAttribute("href", "/login");
});
