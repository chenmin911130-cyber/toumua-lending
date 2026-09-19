import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function read(rel) {
  return readFileSync(join(src, rel), "utf8");
}

test("landing apply CTAs go to /login, not /register or /help", () => {
  const files = [
    "components/marketing/Hero.tsx",
    "components/marketing/Navbar.tsx",
    "components/marketing/CTASection.tsx",
    "components/marketing/LoanCalculator.tsx",
    "pages/loans.tsx",
  ];

  for (const file of files) {
    const source = read(file);
    assert.match(source, /to="\/login"/, `${file} should send apply CTAs to /login`);
    assert.doesNotMatch(source, /to="\/register"/, `${file} must not send apply CTAs to /register`);
  }

  const hero = read("components/marketing/Hero.tsx");
  assert.match(hero, /to="\/login"[\s\S]+Check my options/);
  assert.match(hero, /to="\/help"[\s\S]+Talk to us/);
});

test("FAQ and help links go to /help only", () => {
  const navbar = read("components/marketing/Navbar.tsx");
  assert.match(navbar, /label: "FAQ", href: "\/help"/);
  assert.match(navbar, /label: "Contact", href: "\/help"/);
  assert.doesNotMatch(navbar, /\/#faq/);

  const footer = read("components/marketing/Footer.tsx");
  assert.match(footer, /label: "FAQ", to: "\/help"/);
  assert.match(footer, /label: "Contact", to: "\/help"/);
  assert.doesNotMatch(footer, /\/#faq/);
});
