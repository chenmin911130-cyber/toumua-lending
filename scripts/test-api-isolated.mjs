#!/usr/bin/env node
/**
 * Isolated API test runner.
 *
 * Creates a throwaway PostgreSQL 16 cluster in /tmp, applies the migrations to
 * it, runs the API test suite (or the files/flags you pass through) and then
 * stops and deletes only its own cluster. It never reads .env, never touches an
 * existing database or server, and never prints a connection string.
 *
 * Usage:
 *   node scripts/test-api-isolated.mjs                 # full API suite
 *   node scripts/test-api-isolated.mjs test/unit.spec.ts
 *   node scripts/test-api-isolated.mjs --reporter=dot
 *
 * Environment overrides:
 *   TOUMUA_PG_BIN   PostgreSQL bin directory (default Homebrew postgresql@16)
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const API_DIR = join(ROOT, "apps", "api");
const PG_BIN = process.env.TOUMUA_PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
const PG_BINARIES = ["initdb", "pg_ctl", "createdb", "pg_isready", "psql"];
const DB_PREFIX = "toumua_iso_";
const VITEST_ARGS = process.argv.slice(2);

const clusterRoot = mkdtempSync(join("/tmp", "toumua-iso-"));
const dataDir = join(clusterRoot, "data");
const socketDir = join(clusterRoot, "sock");
const logFile = join(clusterRoot, "postgres.log");
const markerPath = join(clusterRoot, ".toumua-isolated-cluster");
const markerToken = randomBytes(24).toString("hex");
writeFileSync(markerPath, markerToken, { mode: 0o600 });

const databaseName = `${DB_PREFIX}${randomBytes(6).toString("hex")}`;
let clusterStarted = false;
let cleaned = false;

function bin(name) {
  return join(PG_BIN, name);
}

/**
 * Stop and delete only the cluster we created. If the server cannot be stopped
 * (or a partial start left a postmaster running) the tree is deliberately left
 * on disk: removing a live cluster's data directory would corrupt it and is
 * worse than leaving temporary files for an operator to inspect.
 */
function cleanup() {
  if (cleaned) return;
  cleaned = true;

  const serverMayBeRunning =
    clusterStarted || existsSync(join(dataDir, "postmaster.pid"));
  if (serverMayBeRunning) {
    const stop = spawnSync(bin("pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"], {
      stdio: "ignore",
      timeout: 60_000,
    });
    if (stop.status !== 0) {
      console.error(
        `[isolated] could not stop PostgreSQL cleanly; leaving ${clusterRoot} in place for inspection`,
      );
      return;
    }
  }

  try {
    // Only delete the tree we own. If the marker is gone or wrong, leave it
    // alone rather than risk removing a directory we did not create.
    const marker = readFileSync(markerPath, "utf8").trim();
    if (marker === markerToken) {
      rmSync(clusterRoot, { recursive: true, force: true });
    } else {
      console.error(`[isolated] marker mismatch; leaving ${clusterRoot} in place`);
    }
  } catch {
    // Nothing more to clean up.
  }
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(128 + (signal === "SIGINT" ? 2 : signal === "SIGTERM" ? 15 : 1));
  });
}
process.on("exit", cleanup);
process.on("uncaughtException", (error) => {
  cleanup();
  console.error(error);
  process.exit(1);
});

function fail(message) {
  console.error(`[isolated] ${message}`);
  cleanup();
  process.exit(2);
}

function run(command, args, options = {}) {
  const { timeoutMs = 120_000, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    timeout: timeoutMs,
    ...spawnOptions,
  });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.signal) fail(`${command} timed out or was killed (${result.signal}).`);
  return result.status ?? 1;
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

async function main() {
  for (const name of PG_BINARIES) {
    if (!existsSync(bin(name))) {
      fail(`PostgreSQL tool ${name} not found at ${bin(name)}. Set TOUMUA_PG_BIN to a valid bin directory.`);
    }
  }
  const prismaBin = join(API_DIR, "node_modules", ".bin", "prisma");
  const vitestBin = join(API_DIR, "node_modules", ".bin", "vitest");
  if (!existsSync(prismaBin) || !existsSync(vitestBin)) {
    fail("Local prisma/vitest binaries are missing. Run the project's existing install step first; this runner does not install packages.");
  }

  const osUser = process.env.USER || process.env.LOGNAME || "postgres";
  const port = await freePort();
  mkdirSync(socketDir, { recursive: true });

  console.log(`[isolated] creating disposable PostgreSQL cluster in ${clusterRoot}`);

  const initStatus = run(bin("initdb"), [
    "-D",
    dataDir,
    "-U",
    osUser,
    "-A",
    "trust",
    "-E",
    "UTF8",
    "--no-locale",
  ]);
  if (initStatus !== 0) fail("initdb failed; no existing database was touched.");

  const startStatus = run(
    bin("pg_ctl"),
    [
      "-D",
      dataDir,
      "-l",
      logFile,
      "-o",
      `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${socketDir}`,
      "-w",
      "start",
    ],
    { timeoutMs: 60_000 },
  );
  if (startStatus !== 0) fail(`pg_ctl start failed; see ${logFile}`);
  clusterStarted = true;

  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    const check = spawnSync(bin("pg_isready"), ["-h", "127.0.0.1", "-p", String(port), "-U", osUser], {
      stdio: "ignore",
      timeout: 10_000,
    });
    ready = check.status === 0;
    if (!ready) sleep(250);
  }
  if (!ready) fail("The disposable cluster did not become ready.");

  const createStatus = run(
    bin("createdb"),
    [
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      osUser,
      databaseName,
    ],
    { timeoutMs: 30_000 },
  );
  if (createStatus !== 0) fail("createdb failed on the disposable cluster.");

  // No password: the cluster only accepts loopback trust connections. Never
  // print this value.
  const databaseUrl = `postgresql://${encodeURIComponent(osUser)}@127.0.0.1:${port}/${databaseName}`;
  const childEnv = {
    ...process.env,
    NODE_ENV: "test",
    TOUMUA_ISOLATED_TEST: "1",
    TOUMUA_ISOLATED_TEST_DB_NAME: databaseName,
    TOUMUA_ISOLATED_TEST_CLUSTER: clusterRoot,
    TOUMUA_ISOLATED_TEST_TOKEN: markerToken,
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
    CALCULATION_POLICY: "test",
    MAIL_DRIVER: "memory",
    PUBLIC_WEB_URL: "http://127.0.0.1:5173",
    COOKIE_SECURE: "false",
    SESSION_SECRET: randomBytes(32).toString("hex"),
    CSRF_SECRET: randomBytes(32).toString("hex"),
    BOOTSTRAP_ADMIN_EMAIL: "admin@example.com",
    BOOTSTRAP_ADMIN_NAME: "Workspace Admin",
    BOOTSTRAP_ADMIN_PASSWORD: "ChangeMeAdmin12",
    UPLOAD_DIR: join(clusterRoot, "uploads"),
  };

  console.log("[isolated] applying migrations to the disposable database");
  const migrateStatus = run(prismaBin, ["migrate", "deploy"], {
    cwd: API_DIR,
    env: childEnv,
    timeoutMs: 180_000,
  });
  if (migrateStatus !== 0) fail("prisma migrate deploy failed on the disposable cluster.");

  console.log("[isolated] running API tests");
  const testStatus = run(vitestBin, ["run", ...VITEST_ARGS], {
    cwd: API_DIR,
    env: childEnv,
    timeoutMs: 900_000,
  });
  cleanup();
  process.exit(testStatus);
}

main().catch((error) => {
  cleanup();
  console.error(error);
  process.exit(1);
});
