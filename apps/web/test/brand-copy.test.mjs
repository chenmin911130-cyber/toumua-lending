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

test("footer small print keeps the registered company name", () => {
  const footer = read("src/components/marketing/Footer.tsx");
  const site = read("src/site.ts");
  assert.match(site, /export const LEGAL_ENTITY = "Toumu’a Money Transfer Ltd"/);
  assert.match(site, /export const OPERATED_BY = `Operated by \$\{LEGAL_ENTITY\}`/);
  assert.match(footer, /\{OPERATED_BY\}/);
  assert.doesNotMatch(footer, /LEGAL_ENTITY/);
});

test("public UI brand is Toumu’a Lending, not Money Transfer", () => {
  const site = read("src/site.ts");
  assert.match(site, /export const SITE_NAME = "Toumu’a Lending"/);
  assert.doesNotMatch(site, /DEMO_NOTICE[\s\S]*Money Transfer/);

  const files = [
    ...walk(src),
    join(root, "index.html"),
    join(root, "scripts/prerender.mjs"),
  ];

  for (const file of files) {
    const rel = relative(root, file).replaceAll("\\", "/");
    if (rel === "src/site.ts") continue;
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /Money Transfer|money transfer/,
      `${rel} must not show Money Transfer branding`,
    );
  }

  const logo = readFileSync(join(root, "..", "..", "packages/ui/src/Logo.tsx"), "utf8");
  assert.match(logo, /subtitle = "Lending"/);
  assert.doesNotMatch(logo, /Money Transfer|money transfer/);
});
