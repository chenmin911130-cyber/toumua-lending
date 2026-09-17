import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../design/v2/controls.json", import.meta.url);
const controls = JSON.parse(readFileSync(path, "utf8"));

const implemented = new Set([
  "GLOBAL-01",
  "GLOBAL-05",
  "GLOBAL-06",
  "GLOBAL-07",
  "GLOBAL-12",
  "GLOBAL-23",
  "C01-01",
  "C01-02",
  "C01-03",
  "C02-01",
  "C02-02",
  "C02-03",
  "C02-04",
  "C10-01",
  "C10-02",
  "A01-01",
  "A01-02",
  "A02-01",
  "A02-02",
  "A03-01",
  "A03-02",
  "A04-01",
  "A04-02",
  "A04-03",
  "A05-01",
  "A05-02",
  "A05-03",
  "A05-04",
  "A06-01",
  "A06-02",
  "A07-01",
  "A07-02",
  "S16-01",
  "S16-02",
  "S16-03",
  "S16-04",
  "S16-05",
  "S16-06",
  "S16-07",
  "S16-08",
  "S19-01",
  "S19-02",
  "S19-03",
]);

const apiRefs = {
  GLOBAL: ["apps/web/src/layouts.tsx", "packages/ui/src/Logo.tsx"],
  C01: ["apps/web/src/pages/public.tsx"],
  C02: ["apps/web/src/pages/public.tsx", "apps/api/src/auth/auth.service.ts"],
  C10: ["apps/web/src/pages/customer.tsx", "apps/api/src/customer/customer.controller.ts"],
  A01: ["apps/web/src/pages/public.tsx", "apps/api/src/auth/auth.service.ts"],
  A02: ["apps/web/src/pages/public.tsx", "apps/api/src/auth/auth.service.ts"],
  A03: ["apps/web/src/pages/public.tsx", "apps/api/src/auth/auth.service.ts"],
  A04: ["apps/web/src/pages/public.tsx", "apps/api/src/auth/auth.service.ts"],
  A05: ["apps/web/src/pages/public.tsx", "apps/api/src/auth/auth.service.ts"],
  A06: ["apps/web/src/pages/public.tsx", "apps/api/src/auth/auth.service.ts"],
  A07: ["apps/web/src/pages/public.tsx", "apps/api/src/auth/auth.service.ts"],
  S16: ["apps/web/src/pages/staff.tsx", "apps/api/src/staff/staff.service.ts"],
  S19: ["apps/web/src/pages/staff.tsx", "apps/api/src/audit/audit.service.ts"],
};

const testRefs = {
  GLOBAL: ["apps/api/test/auth.spec.ts", "tests/e2e/tests/auth.spec.ts"],
  C01: ["tests/e2e/tests/auth.spec.ts"],
  C02: ["apps/api/test/auth.spec.ts", "tests/e2e/tests/auth.spec.ts"],
  C10: ["apps/api/test/auth.spec.ts", "tests/e2e/tests/auth.spec.ts"],
  A01: ["apps/api/test/auth.spec.ts"],
  A02: ["apps/api/test/auth.spec.ts"],
  A03: ["apps/api/test/auth.spec.ts", "tests/e2e/tests/auth.spec.ts"],
  A04: ["apps/api/test/auth.spec.ts", "tests/e2e/tests/auth.spec.ts"],
  A05: ["apps/api/test/auth.spec.ts", "tests/e2e/tests/auth.spec.ts"],
  A06: ["apps/api/test/staff.spec.ts", "tests/e2e/tests/auth.spec.ts"],
  A07: ["apps/api/test/auth.spec.ts"],
  S16: ["apps/api/test/staff.spec.ts", "tests/e2e/tests/auth.spec.ts"],
  S19: ["apps/api/test/staff.spec.ts"],
};

const passedByApi = new Set([
  "C02-01",
  "C02-03",
  "C02-04",
  "C10-01",
  "C10-02",
  "A01-01",
  "A02-01",
  "A03-01",
  "A04-01",
  "A04-02",
  "A05-01",
  "A05-02",
  "A06-01",
  "A07-01",
  "S16-01",
  "S16-02",
  "S16-04",
  "S16-05",
  "S16-06",
  "S16-08",
  "S19-01",
  "GLOBAL-07",
]);

for (const control of controls) {
  if (!implemented.has(control.id)) continue;
  const prefix = control.id.split("-")[0];
  control.implementation_status = "implemented";
  control.implementation_refs = apiRefs[prefix] ?? [];
  control.test_refs = testRefs[prefix] ?? [];
  control.test_status = passedByApi.has(control.id) ? "passed" : "not_run";
}

writeFileSync(path, `${JSON.stringify(controls, null, 2)}\n`);
console.log(
  `updated ${implemented.size} controls; passed=${[...passedByApi].length}`,
);
