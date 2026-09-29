const { config } = require("dotenv");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

config({ path: resolve(__dirname, "../../../.env") });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error("TEST_DATABASE_URL is not set in the root .env file.");
  process.exit(1);
}

const testDbName = new URL(testUrl).pathname.replace(/^\//, "");
if (!testDbName.endsWith("_test")) {
  console.error(
    `Refusing to migrate database "${testDbName}". TEST_DATABASE_URL must point to a *_test database.`,
  );
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: testUrl };
const result = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env,
  cwd: resolve(__dirname, ".."),
});

process.exit(result.status ?? 1);
