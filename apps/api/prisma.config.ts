import { config } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

// The isolated test runner exports its own generated DATABASE_URL and sets
// TOUMUA_ISOLATED_TEST=1. In that mode we must not read the developer's .env:
// doing so could let a migration CLI connect to a real database. Everywhere
// else the local .env is still the expected configuration source.
const isolated = process.env.TOUMUA_ISOLATED_TEST === "1";
if (!isolated) {
  config({ path: resolve(__dirname, "../../.env") });
}

/**
 * Even in isolated mode, fail closed if the URL is not unmistakably disposable.
 * The runner generating the URL is the primary control; this stops a stray
 * environment from migrating a remote server if the runner is bypassed.
 */
function assertIsolatedDatabaseUrl(raw: string | undefined): void {
  let url: URL;
  try {
    url = new URL(raw ?? "");
  } catch {
    throw new Error("The isolated test runner must export a valid DATABASE_URL.");
  }
  const name = url.pathname.replace(/^\//, "");
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
  if ((url.protocol !== "postgresql:" && url.protocol !== "postgres:") || !loopback || !name.startsWith("toumua_iso_")) {
    throw new Error(
      "Refusing isolated Prisma CLI: DATABASE_URL must be a loopback postgresql:// URL with a generated toumua_iso_ database name.",
    );
  }
}

if (isolated) {
  assertIsolatedDatabaseUrl(process.env.DATABASE_URL);
} else if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required (set it in .env or in the environment).");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
