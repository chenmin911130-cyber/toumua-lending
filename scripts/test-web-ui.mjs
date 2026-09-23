/**
 * Isolated Vite + Playwright UI suite.
 * Does not read .env, does not proxy to an API, and does not reuse servers.
 * Every process it starts (Vite server + Playwright child) is bounded and
 * torn down by this script; it never signals processes it did not start.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { aucklandBusinessDate } from "../apps/web/src/format.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(repoRoot, "apps/web");
const e2eRoot = path.join(repoRoot, "tests/e2e");

const CHILD_TIMEOUT_MS = Number(process.env.WEB_UI_CHILD_TIMEOUT_MS ?? 180_000);
if (!Number.isFinite(CHILD_TIMEOUT_MS) || CHILD_TIMEOUT_MS <= 0) {
  throw new Error("WEB_UI_CHILD_TIMEOUT_MS must be a positive number");
}

const vite = await import(pathToFileURL(path.join(webRoot, "node_modules/vite/dist/node/index.js")).href);
const reactPlugin = (await import(pathToFileURL(path.join(webRoot, "node_modules/@vitejs/plugin-react/dist/index.js")).href)).default;
const tailwind = (await import(pathToFileURL(path.join(webRoot, "node_modules/@tailwindcss/vite/dist/index.mjs")).href)).default;

// Playwright output (screenshots/traces/HTML) goes to a fresh temp dir that this
// script owns and removes, so the repo stays clean.
const outputDir = mkdtempSync(path.join(os.tmpdir(), "toumua-web-ui-"));

// Vite treats `port: 0` as its default 5173, which we refuse to reuse. Reserve a
// free loopback port first, then bind it explicitly and fail if it is taken.
function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

const reservedPorts = [3001, 4173, 5173];
const port = await freeLoopbackPort();
if (!port || reservedPorts.includes(port)) {
  throw new Error(`Refusing to bind reserved port ${port}`);
}

const server = await vite.createServer({
  configFile: false,
  envDir: false,
  root: webRoot,
  plugins: [tailwind(), reactPlugin()],
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
  },
  logLevel: "warn",
});

let child = null;
let timedOut = false;
let exiting = false;

function killChild(reason) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  console.error(`web-ui harness: terminating Playwright child (${reason})`);
  try {
    // The child is spawned detached so it leads its own process group; signal
    // only that group, never the caller's or any other process.
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

async function cleanup(reason) {
  if (exiting) return;
  exiting = true;
  killChild(reason);
  try {
    await server.close();
  } catch {
    /* server already closed */
  }
  try {
    rmSync(outputDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void cleanup(signal).then(() => process.exit(130));
  });
}

let exitCode = 1;
try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error(`Vite did not bind a loopback port: ${JSON.stringify(address)}`);
  }
  if (address.address !== "127.0.0.1" || reservedPorts.includes(address.port)) {
    throw new Error(`Refusing server ${address.address}:${address.port}`);
  }
  const baseURL = `http://127.0.0.1:${address.port}`;
  console.log(`web-ui harness ${baseURL}`);
  child = spawn(
    process.execPath,
    [path.join(e2eRoot, "node_modules/@playwright/test/cli.js"), "test", "-c", "playwright.ui.config.mjs"],
    {
      cwd: e2eRoot,
      stdio: "inherit",
      detached: true,
      env: {
        ...process.env,
        WEB_UI_BASE_URL: baseURL,
        WEB_UI_EXPECTED_DATE: aucklandBusinessDate(),
        WEB_UI_OUTPUT_DIR: outputDir,
        PLAYWRIGHT_HTML_OPEN: "never",
      },
    },
  );
  exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      killChild(`timeout after ${CHILD_TIMEOUT_MS}ms`);
    }, CHILD_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
} finally {
  await cleanup(timedOut ? "timeout" : "completion");
}

if (timedOut) {
  console.error(`web-ui harness: Playwright exceeded ${CHILD_TIMEOUT_MS}ms`);
  process.exit(1);
}
process.exit(exitCode);
