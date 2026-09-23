import { describe, expect, it } from "vitest";
import { IsolationEnv, IsolationFs, planIsolatedTarget } from "./isolation";

const TOKEN = "a".repeat(40);
const CLUSTER = "/tmp/toumua-iso-abc";
const DATA = `${CLUSTER}/data`;
const MARKER = `${CLUSTER}/.toumua-isolated-cluster`;
const DB_NAME = "toumua_iso_abc123";
const URL = `postgresql://tester@127.0.0.1:5599/${DB_NAME}`;

function makeFs(options: {
  existing?: string[];
  markers?: Record<string, string>;
  reals?: Record<string, string>;
} = {}): IsolationFs {
  const existing = new Set(options.existing ?? []);
  const markers = options.markers ?? {};
  const reals = options.reals ?? {};
  return {
    existsSync: (path) => existing.has(path) || path in markers,
    readFileSync: (path) => {
      if (!(path in markers)) throw new Error(`ENOENT ${path}`);
      return markers[path];
    },
    realpathSync: (path) => {
      if (!(path in reals)) throw new Error(`ENOENT ${path}`);
      return reals[path];
    },
  };
}

function validEnv(overrides: IsolationEnv = {}): IsolationEnv {
  return {
    TOUMUA_ISOLATED_TEST: "1",
    TOUMUA_ISOLATED_TEST_DB_NAME: DB_NAME,
    TOUMUA_ISOLATED_TEST_CLUSTER: CLUSTER,
    TOUMUA_ISOLATED_TEST_TOKEN: TOKEN,
    DATABASE_URL: URL,
    TEST_DATABASE_URL: URL,
    ...overrides,
  };
}

function validFs() {
  return makeFs({
    existing: [MARKER, DATA],
    markers: { [MARKER]: TOKEN },
    reals: {
      "/tmp": "/private/tmp",
      "/private/tmp": "/private/tmp",
      "/var/tmp": "/private/var/tmp",
      [CLUSTER]: `/private/tmp/toumua-iso-abc`,
      [DATA]: `/private/tmp/toumua-iso-abc/data`,
    },
  });
}

describe("isolated cluster guard", () => {
  it("accepts a generated loopback target owned by the temp cluster", () => {
    const target = planIsolatedTarget(validEnv(), validFs());
    expect(target.databaseName).toBe(DB_NAME);
    expect(target.databaseUrl).toBe(URL);
    expect(target.dataDir).toBe(DATA);
  });

  it("refuses to run without the isolated flag", () => {
    expect(() => planIsolatedTarget({}, validFs())).toThrow(/TOUMUA_ISOLATED_TEST/);
  });

  it("refuses a non-loopback host even with a generated name", () => {
    expect(() =>
      planIsolatedTarget(
        validEnv({ DATABASE_URL: `postgresql://tester@db.example.com:5432/${DB_NAME}` }),
        validFs(),
      ),
    ).toThrow(/loopback/);
  });

  it("refuses a URL that does not match the generated database name", () => {
    expect(() =>
      planIsolatedTarget(
        validEnv({ DATABASE_URL: "postgresql://tester@127.0.0.1:5599/toumua_iso_other" }),
        validFs(),
      ),
    ).toThrow(/must target the generated database/);
  });

  it("refuses a marker token that does not match the environment", () => {
    const fs = makeFs({
      existing: [MARKER, DATA],
      markers: { [MARKER]: "b".repeat(40) },
      reals: {
        "/tmp": "/private/tmp",
        "/private/tmp": "/private/tmp",
        [CLUSTER]: "/private/tmp/toumua-iso-abc",
        [DATA]: "/private/tmp/toumua-iso-abc/data",
      },
    });
    expect(() => planIsolatedTarget(validEnv(), fs)).toThrow(/marker does not match/);
  });

  it("refuses a cluster outside the system temp directory", () => {
    const fs = makeFs({
      existing: [MARKER, DATA],
      markers: { [MARKER]: TOKEN },
      reals: {
        "/tmp": "/private/tmp",
        "/private/tmp": "/private/tmp",
        [CLUSTER]: "/Users/someone/toumua-iso-abc",
        [DATA]: "/Users/someone/toumua-iso-abc/data",
      },
    });
    expect(() => planIsolatedTarget(validEnv(), fs)).toThrow(/not under a system temporary directory/);
  });

  it("refuses when the ownership marker file is missing", () => {
    const fs = makeFs({
      existing: [DATA],
      reals: {
        "/tmp": "/private/tmp",
        "/private/tmp": "/private/tmp",
        [CLUSTER]: "/private/tmp/toumua-iso-abc",
        [DATA]: "/private/tmp/toumua-iso-abc/data",
      },
    });
    expect(() => planIsolatedTarget(validEnv(), fs)).toThrow(/marker .* is missing/);
  });

  it("refuses a short ownership token", () => {
    expect(() =>
      planIsolatedTarget(validEnv({ TOUMUA_ISOLATED_TEST_TOKEN: "short" }), validFs()),
    ).toThrow(/too short/);
  });
});
