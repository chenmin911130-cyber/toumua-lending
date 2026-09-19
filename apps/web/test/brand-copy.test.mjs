import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(tsx|ts|jsx|js|mjs|html)$/.test(entry)) files.push(full);
  }
  return files;
}

const publicFiles = [
  ...walk(src),
  join(root, "index.html"),
  join(root, "scripts/prerender.mjs"),
];

test("footer and shared copy match the designer lines", () => {
  const footer = read("src/components/marketing/Footer.tsx");
  const site = read("src/site.ts");
  assert.match(site, /export const LEGAL_ENTITY = "Toumu’a Lending Ltd"/);
  assert.match(site, /export const OPERATED_BY = `Operated by \$\{LEGAL_ENTITY\}`/);
  assert.match(site, /export const TAGLINE = "Secured loans for personal, vehicle and business needs\."/);
  assert.match(site, /export const DISCLAIMER = "Loans are arranged with our office\. Terms apply\."/);
  assert.match(footer, /\{TAGLINE\}/);
  assert.match(footer, /© 2026 Toumu’a Lending\./);
  assert.match(footer, /\{OPERATED_BY\}/);
  assert.match(footer, /\{DISCLAIMER\}/);
  assert.doesNotMatch(footer, /LEGAL_ENTITY/);
});

test("public UI brand is Toumu’a Lending, without classroom wording", () => {
  const site = read("src/site.ts");
  assert.match(site, /export const SITE_NAME = "Toumu’a Lending"/);
  assert.doesNotMatch(site, /Money Transfer|COMP721|demonstration|teaching/);

  for (const file of publicFiles) {
    const rel = relative(root, file).replaceAll("\\", "/");
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /Money Transfer|money transfer/,
      `${rel} must not show Money Transfer branding`,
    );
    assert.doesNotMatch(source, /COMP721/, `${rel} must not mention COMP721`);
    assert.doesNotMatch(
      source,
      /\b(demonstration|teaching|university demonstration|school demonstration)\b/i,
      `${rel} must not use classroom demo wording`,
    );
  }

  const logo = readFileSync(join(root, "..", "..", "packages/ui/src/Logo.tsx"), "utf8");
  assert.match(logo, /subtitle = "Lending"/);
  assert.doesNotMatch(logo, /Money Transfer|money transfer|COMP721/);
});
