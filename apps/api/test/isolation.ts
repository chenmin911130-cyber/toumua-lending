import { existsSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, sep } from "node:path";

/**
 * Offline validation for the disposable API test cluster.
 *
 * The integration suite truncates every table, so it must be impossible for a
 * stray environment to point it at a real server. The connection string is only
 * one signal: the generated database name, the temporary cluster directory the
 * runner created, and the private token inside its marker file must all agree
 * before any connection is opened. The filesystem probe is injectable so the
 * rules can be unit-tested without creating a cluster.
 */
export const ISOLATED_FLAG = "TOUMUA_ISOLATED_TEST";
export const ISOLATED_DB_NAME = "TOUMUA_ISOLATED_TEST_DB_NAME";
export const ISOLATED_CLUSTER = "TOUMUA_ISOLATED_TEST_CLUSTER";
export const ISOLATED_TOKEN = "TOUMUA_ISOLATED_TEST_TOKEN";
export const ISOLATED_DB_PREFIX = "toumua_iso_";
export const ISOLATED_MARKER = ".toumua-isolated-cluster";
export const ISOLATED_MIN_TOKEN_LENGTH = 32;

export type IsolationEnv = Record<string, string | undefined>;

export type IsolationFs = {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
  realpathSync(path: string): string;
};

export interface IsolatedTarget {
  databaseName: string;
  databaseUrl: string;
  testDatabaseUrl: string;
  clusterRoot: string;
  dataDir: string;
  markerPath: string;
  token: string;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

const defaultFs: IsolationFs = {
  existsSync,
  readFileSync: (path, encoding) => readFileSync(path, encoding),
  realpathSync,
};

function refuse(message: string): never {
  throw new Error(`Refusing to run API tests: ${message}`);
}

/** Parses a connection string and rejects anything that is not loopback. */
export function parseIsolatedDatabaseUrl(raw: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    refuse(`${label} is not a valid URL.`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    refuse(`${label} must be a postgresql:// URL.`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    refuse(
      `${label} must target loopback (127.0.0.1, ::1 or localhost), not ${url.hostname || "<missing>"}.`,
    );
  }
  if (url.searchParams.has("host") || url.searchParams.has("hostaddr")) {
    refuse(`${label} must not override the host through query parameters.`);
  }
  return url;
}

function databaseNameOf(url: URL): string {
  return url.pathname.replace(/^\//, "");
}

function realIfExists(fs: IsolationFs, path: string): string | null {
  try {
    return fs.realpathSync(path);
  } catch {
    return null;
  }
}

/**
 * Validates every offline marker and returns the target the caller may connect
 * to. It never touches the network: only after this returns should any client
 * be pointed at `databaseUrl`.
 */
export function planIsolatedTarget(
  env: IsolationEnv,
  fs: IsolationFs = defaultFs,
): IsolatedTarget {
  if (env[ISOLATED_FLAG] !== "1") {
    refuse(
      "TOUMUA_ISOLATED_TEST is not 1. Run `node scripts/test-api-isolated.mjs` " +
        "from the repository root; it creates a throwaway PostgreSQL cluster so " +
        "no existing database is touched.",
    );
  }

  const clusterRoot = env[ISOLATED_CLUSTER];
  const token = env[ISOLATED_TOKEN];
  const expectedName = env[ISOLATED_DB_NAME];
  const databaseUrl = env.DATABASE_URL;
  const testDatabaseUrl = env.TEST_DATABASE_URL;

  if (!clusterRoot || !isAbsolute(clusterRoot)) {
    refuse(`${ISOLATED_CLUSTER} must be an absolute path.`);
  }
  if (!token || token.length < ISOLATED_MIN_TOKEN_LENGTH) {
    refuse(`${ISOLATED_TOKEN} is missing or too short to identify the owned cluster.`);
  }
  if (!expectedName) {
    refuse(`${ISOLATED_DB_NAME} is required.`);
  }
  if (!databaseUrl || !testDatabaseUrl) {
    refuse("DATABASE_URL and TEST_DATABASE_URL must both be set for the disposable cluster.");
  }

  const parsed = parseIsolatedDatabaseUrl(databaseUrl, "DATABASE_URL");
  const parsedTest = parseIsolatedDatabaseUrl(testDatabaseUrl, "TEST_DATABASE_URL");
  const urlName = databaseNameOf(parsed);
  const testName = databaseNameOf(parsedTest);
  if (urlName !== expectedName || testName !== expectedName) {
    refuse(
      `the connection URLs must target the generated database ${expectedName}, not ` +
        `${urlName || testName || "<unknown>"}.`,
    );
  }
  if (!expectedName.startsWith(ISOLATED_DB_PREFIX)) {
    refuse(
      `${expectedName} is not a generated disposable name (expected a ${ISOLATED_DB_PREFIX} prefix).`,
    );
  }

  const realClusterRoot = realIfExists(fs, clusterRoot);
  if (!realClusterRoot) {
    refuse(`the isolated cluster directory ${clusterRoot} does not exist.`);
  }
  const tempRoots = [tmpdir(), "/tmp", "/var/tmp", "/private/tmp"]
    .map((candidate) => realIfExists(fs, candidate))
    .filter((value): value is string => value !== null);
  const underTemp = tempRoots.some(
    (root) => realClusterRoot === root || realClusterRoot.startsWith(root + sep),
  );
  if (!underTemp) {
    refuse(`the isolated cluster at ${realClusterRoot} is not under a system temporary directory.`);
  }

  const markerPath = join(clusterRoot, ISOLATED_MARKER);
  if (!fs.existsSync(markerPath)) {
    refuse(`the isolated cluster marker ${markerPath} is missing.`);
  }
  const marker = fs.readFileSync(markerPath, "utf8").trim();
  if (marker !== token) {
    refuse(`the isolated cluster marker does not match ${ISOLATED_TOKEN}.`);
  }

  const dataDir = join(clusterRoot, "data");
  if (!fs.existsSync(dataDir)) {
    refuse(`the isolated cluster data directory ${dataDir} is missing.`);
  }

  return {
    databaseName: expectedName,
    databaseUrl,
    testDatabaseUrl,
    clusterRoot,
    dataDir,
    markerPath,
    token,
  };
}
