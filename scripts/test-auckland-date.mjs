import {
  aucklandBusinessDate,
  aucklandDateTimeLocal,
  aucklandWallTimeToIso,
  businessDateFromStored,
  isDueOnAucklandToday,
} from "../apps/web/src/format.ts";

let failed = 0;
let passed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`ok ${message}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${message}`);
}

function assertThrows(fn, message) {
  try {
    fn();
  } catch {
    passed += 1;
    console.log(`ok ${message}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${message}`);
}

const nzdtAfterMidnight = new Date("2024-01-15T11:30:00.000Z");
const nzdtBeforeMidnight = new Date("2024-01-15T10:59:00.000Z");
const nzstAfterMidnight = new Date("2024-07-15T12:30:00.000Z");
const nzstBeforeMidnight = new Date("2024-07-15T11:59:00.000Z");

assert(aucklandBusinessDate(nzdtAfterMidnight) === "2024-01-16", "NZDT just after Auckland midnight");
assert(aucklandBusinessDate(nzdtBeforeMidnight) === "2024-01-15", "NZDT just before Auckland midnight");
assert(aucklandBusinessDate(nzstAfterMidnight) === "2024-07-16", "NZST just after Auckland midnight");
assert(aucklandBusinessDate(nzstBeforeMidnight) === "2024-07-15", "NZST just before Auckland midnight");
assert(
  aucklandBusinessDate(nzdtAfterMidnight) !== nzdtAfterMidnight.toISOString().slice(0, 10),
  "Auckland date is not the UTC slice near midnight",
);
assert(
  aucklandDateTimeLocal(nzdtAfterMidnight) === "2024-01-16T00:30",
  "NZDT datetime-local wall clock",
);
assert(
  aucklandDateTimeLocal(nzstAfterMidnight) === "2024-07-16T00:30",
  "NZST datetime-local wall clock",
);
assert(
  aucklandWallTimeToIso("2024-01-16T00:30") === "2024-01-15T11:30:00.000Z",
  "NZDT wall time converts to the UTC instant",
);
assert(
  aucklandWallTimeToIso("2024-07-16T00:30") === "2024-07-15T12:30:00.000Z",
  "NZST wall time converts to the UTC instant",
);
assert(
  aucklandWallTimeToIso("2024-04-07T02:30") === "2024-04-06T13:30:00.000Z",
  "ambiguous fall-back wall time resolves to the earlier NZDT instant",
);
assert(
  aucklandWallTimeToIso("2024-04-07T03:30") === "2024-04-06T15:30:00.000Z",
  "NZST wall time after the fall-back transition is not shifted",
);
assertThrows(
  () => aucklandWallTimeToIso("2024-09-29T02:30"),
  "spring-forward gap is rejected instead of silently shifted",
);
assertThrows(
  () => aucklandWallTimeToIso("2024-02-30T10:00"),
  "impossible calendar date is rejected",
);
assertThrows(
  () => aucklandWallTimeToIso("2024-01-16T24:00"),
  "out-of-range hour is rejected",
);
assert(businessDateFromStored("2024-01-16") === "2024-01-16", "date-only stored value is not shifted");
assert(
  businessDateFromStored("2024-01-16T00:00:00.000Z") === "2024-01-16",
  "UTC midnight schedule date keeps the office date",
);
assert(
  isDueOnAucklandToday("2024-01-16T00:00:00.000Z", nzdtAfterMidnight),
  "due today follows Auckland, not the UTC calendar day of the clock",
);
assert(
  !isDueOnAucklandToday("2024-01-15T00:00:00.000Z", nzdtAfterMidnight),
  "previous office date is not due after Auckland midnight",
);

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
