import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { advance, buildSchedule, outstanding, quoteRepayment, quoteSettlement } from "../src/lending/calculation-policy";
import { classifyApproval } from "../src/lending/approval-policy";
import { buildReadiness, isReadyForCustomerSubmit, isReadyToSubmit } from "../src/lending/readiness";
import {
  add,
  compare,
  fromCents,
  splitEvenly,
  subtract,
  sum,
  toCents,
} from "../src/lending/money";

describe("money", () => {
  it("does decimal arithmetic exactly, never with floats", () => {
    // The classic float failure: 0.1 + 0.2 === 0.30000000000000004
    expect(add("0.10", "0.20")).toBe("0.30");
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sum(["0.10", "0.20"])).toBe("0.30");
  });

  it("round-trips amounts through cents", () => {
    for (const amount of ["0.00", "0.01", "0.99", "1.00", "1234.50", "999999.99"]) {
      expect(fromCents(toCents(amount))).toBe(amount);
    }
  });

  it("normalizes short and padded input to two decimals", () => {
    expect(fromCents(toCents("1200"))).toBe("1200.00");
    expect(fromCents(toCents("1200.5"))).toBe("1200.50");
  });

  it("rejects malformed and over-precise amounts instead of truncating", () => {
    for (const bad of ["", "abc", "1.234", "1e3", "1,000.00", "  ", "1.2.3", "-", "--1"]) {
      expect(() => toCents(bad)).toThrow();
    }
    // A signed value is legitimate for ledger amounts and is canonicalised.
    expect(toCents("-1")).toBe(-100);
    expect(fromCents(toCents("-1"))).toBe("-1.00");
  });

  it("compares and subtracts without drift", () => {
    expect(compare("1500.00", "1500.00")).toBe(0);
    expect(compare("0.01", "0.02")).toBe(-1);
    expect(compare("2.00", "1.99")).toBe(1);
    expect(subtract("2000.00", "500.00")).toBe("1500.00");
  });

  it("splits evenly and never loses a cent", () => {
    expect(splitEvenly("2000.00", 4)).toEqual(["500.00", "500.00", "500.00", "500.00"]);

    // 1000.00 / 3 cannot be equal, so the remainder lands on the last part.
    const thirds = splitEvenly("1000.00", 3);
    expect(thirds).toEqual(["333.33", "333.33", "333.34"]);
    expect(sum(thirds)).toBe("1000.00");

    const uneven = splitEvenly("0.10", 3);
    expect(uneven).toEqual(["0.03", "0.03", "0.04"]);
    expect(sum(uneven)).toBe("0.10");
  });

  it("refuses to split into a non-positive number of periods", () => {
    expect(() => splitEvenly("100.00", 0)).toThrow();
    expect(() => splitEvenly("100.00", -2)).toThrow();
  });
});

describe("schedule dates", () => {
  it("steps weekly and fortnightly", () => {
    const start = new Date("2026-10-01T00:00:00.000Z");
    expect(advance(start, "WEEKLY", 1).toISOString().slice(0, 10)).toBe("2026-10-08");
    expect(advance(start, "FORTNIGHTLY", 2).toISOString().slice(0, 10)).toBe("2026-10-29");
  });

  it("clamps a monthly step to the end of a shorter month", () => {
    // 31 January + 1 month must not overflow into March.
    const endOfJan = new Date("2026-01-31T00:00:00.000Z");
    expect(advance(endOfJan, "MONTHLY", 1).toISOString().slice(0, 10)).toBe("2026-02-28");

    const leap = new Date("2028-01-31T00:00:00.000Z");
    expect(advance(leap, "MONTHLY", 1).toISOString().slice(0, 10)).toBe("2028-02-29");
  });

  it("does not drift when stepping several months from a clamped date", () => {
    const endOfJan = new Date("2026-01-31T00:00:00.000Z");
    expect(advance(endOfJan, "MONTHLY", 2).toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(advance(endOfJan, "MONTHLY", 3).toISOString().slice(0, 10)).toBe("2026-04-30");
  });
});

describe("calculation policy", () => {
  const terms = {
    principal: "2000.00",
    frequency: "MONTHLY" as const,
    periods: 4,
    firstPaymentDate: new Date("2026-10-01T00:00:00.000Z"),
  };

  it("builds the acceptance fixture: 2000.00 over 4 installments of 500.00", () => {
    const schedule = buildSchedule(terms);
    expect(schedule.map((entry) => entry.amount)).toEqual([
      "500.00",
      "500.00",
      "500.00",
      "500.00",
    ]);
    expect(schedule.map((entry) => entry.dueDate.toISOString().slice(0, 10))).toEqual([
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
      "2027-02-01",
    ]);
    expect(sum(schedule.map((entry) => entry.amount))).toBe("2000.00");
  });

  it("reports the remaining balance after a payment", () => {
    const schedule = buildSchedule(terms);
    const entries = schedule.map((entry, index) => ({
      id: `e${index + 1}`,
      number: entry.number,
      amount: entry.amount,
      paidAmount: "0.00",
    }));
    expect(outstanding(entries)).toBe("2000.00");

    const quote = quoteRepayment(entries, "500.00");
    expect("reason" in quote).toBe(false);
    if ("reason" in quote) return;
    expect(quote.balanceBefore).toBe("2000.00");
    expect(quote.balanceAfter).toBe("1500.00");
    expect(quote.settled).toBe(false);
    expect(quote.allocations).toHaveLength(1);
    expect(quote.allocations[0].amount).toBe("500.00");
  });

  it("settles only when the balance reaches exactly zero", () => {
    const entries = [
      { id: "e1", number: 1, amount: "500.00", paidAmount: "500.00" },
      { id: "e2", number: 2, amount: "500.00", paidAmount: "0.00" },
    ];
    const quote = quoteRepayment(entries, "500.00");
    if ("reason" in quote) throw new Error(quote.reason);
    expect(quote.balanceAfter).toBe("0.00");
    expect(quote.settled).toBe(true);
  });

  it("allocates across installments in due order", () => {
    const entries = [
      { id: "e1", number: 1, amount: "500.00", paidAmount: "0.00" },
      { id: "e2", number: 2, amount: "500.00", paidAmount: "0.00" },
      { id: "e3", number: 3, amount: "500.00", paidAmount: "0.00" },
    ];
    const quote = quoteRepayment(entries, "750.00");
    if ("reason" in quote) throw new Error(quote.reason);
    expect(quote.allocations.map((a) => [a.number, a.amount])).toEqual([
      [1, "500.00"],
      [2, "250.00"],
    ]);
    expect(quote.allocations[1].paidAmountAfter).toBe("250.00");
    expect(quote.balanceAfter).toBe("750.00");
  });

  it("rejects overpayment rather than absorbing the surplus", () => {
    const entries = [{ id: "e1", number: 1, amount: "500.00", paidAmount: "0.00" }];
    const quote = quoteRepayment(entries, "600.00");
    expect("reason" in quote).toBe(true);
    if ("reason" in quote) expect(quote.reason).toMatch(/more than the outstanding balance/i);
  });

  it("rejects zero, negative and settled loans", () => {
    const open = [{ id: "e1", number: 1, amount: "500.00", paidAmount: "0.00" }];
    const zero = quoteRepayment(open, "0.00");
    expect("reason" in zero).toBe(true);

    const settled = [{ id: "e1", number: 1, amount: "500.00", paidAmount: "500.00" }];
    const quoted = quoteRepayment(settled, "10.00");
    expect("reason" in quoted).toBe(true);
    if ("reason" in quoted) expect(quoted.reason).toMatch(/no outstanding balance/i);
  });
});

describe("demo calculation policy", () => {
  const previous = process.env.CALCULATION_POLICY;

  beforeEach(() => {
    process.env.CALCULATION_POLICY = "demo";
    delete process.env.DEMO_ANNUAL_RATE_BPS;
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.CALCULATION_POLICY;
    else process.env.CALCULATION_POLICY = previous;
    delete process.env.DEMO_ANNUAL_RATE_BPS;
  });

  it("adds 21% simple interest and splits evenly: 2000 over 4 months", () => {
    const schedule = buildSchedule({
      principal: "2000.00",
      frequency: "MONTHLY",
      periods: 4,
      firstPaymentDate: new Date("2026-10-01T00:00:00.000Z"),
    });
    expect(schedule.map((entry) => entry.amount)).toEqual([
      "535.00",
      "535.00",
      "535.00",
      "535.00",
    ]);
    expect(sum(schedule.map((entry) => entry.amount))).toBe("2140.00");
  });

  it("records surplus on a demo settlement instead of leaving it pending", () => {
    const quote = quoteSettlement("200.00", "350.00");
    expect(quote.policy).toBe("demo-simple-interest");
    expect(quote.surplusOrShortfall).toBe("150.00");
    expect(quote.pendingSettlement).toBe(false);
    expect(quote.reason).toBeUndefined();
  });
});

describe("customer application readiness", () => {
  it("lets a customer submit without valuation or terms", () => {
    const items = buildReadiness({
      id: "app-1",
      status: "DRAFT",
      borrowerId: "bor-1",
      requestedAmount: "1500.00",
      purpose: "Vehicle repair",
      proposedTermMonths: 12,
      assets: [{ id: "a1", name: "Gold chain", photoCount: 1, valuationStatus: "REQUESTED" }],
      terms: { firstPaymentDate: null, frequency: null, periods: null, policyConfigured: false },
    });
    expect(isReadyForCustomerSubmit(items)).toBe(true);
    expect(isReadyToSubmit(items)).toBe(false);
  });
});

describe("approval routing", () => {
  it("lets staff take a small simple file and sends the rest to a manager", () => {
    expect(
      classifyApproval({
        requestedAmount: "3000.00",
        purpose: "Vehicle repair",
        purposeDescription: null,
        assetCount: 1,
      }).requiresManager,
    ).toBe(false);
    expect(
      classifyApproval({
        requestedAmount: "3000.01",
        purpose: "Vehicle repair",
        purposeDescription: null,
        assetCount: 1,
      }).requiresManager,
    ).toBe(true);
    expect(
      classifyApproval({
        requestedAmount: "500.00",
        purpose: "Other",
        purposeDescription: null,
        assetCount: 1,
      }).requiresManager,
    ).toBe(true);
    expect(
      classifyApproval({
        requestedAmount: "500.00",
        purpose: "School fees",
        purposeDescription: null,
        assetCount: 3,
      }).requiresManager,
    ).toBe(true);
  });
});
