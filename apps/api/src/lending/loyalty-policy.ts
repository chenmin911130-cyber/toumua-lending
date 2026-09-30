export type LoyaltyTier = "STANDARD" | "RETURNING" | "LOYAL";

const DEFAULT_TIERS = [
  { tier: "RETURNING" as const, minSettled: 1, discountBps: 200 },
  { tier: "LOYAL" as const, minSettled: 3, discountBps: 400 },
];

export function loyaltyTiers(): Array<{ tier: "RETURNING" | "LOYAL"; minSettled: number; discountBps: number }> {
  const raw = (process.env.LOYALTY_TIERS ?? "").trim();
  if (!raw) return DEFAULT_TIERS.map((row) => ({ ...row }));
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("LOYALTY_TIERS is invalid; using the default tiers");
    return DEFAULT_TIERS.map((row) => ({ ...row }));
  }
  if (!Array.isArray(parsed)) {
    console.warn("LOYALTY_TIERS is invalid; using the default tiers");
    return DEFAULT_TIERS.map((row) => ({ ...row }));
  }
  const tiers: Array<{ tier: "RETURNING" | "LOYAL"; minSettled: number; discountBps: number }> = [];
  const seen = new Set<string>();
  for (const element of parsed) {
    if (!element || typeof element !== "object") {
      console.warn("LOYALTY_TIERS is invalid; using the default tiers");
      return DEFAULT_TIERS.map((row) => ({ ...row }));
    }
    const row = element as Record<string, unknown>;
    const tier = row.tier;
    const minSettled = row.minSettled;
    const discountBps = row.discountBps;
    if (tier !== "RETURNING" && tier !== "LOYAL") {
      console.warn("LOYALTY_TIERS is invalid; using the default tiers");
      return DEFAULT_TIERS.map((row) => ({ ...row }));
    }
    if (!Number.isInteger(minSettled) || (minSettled as number) < 1) {
      console.warn("LOYALTY_TIERS is invalid; using the default tiers");
      return DEFAULT_TIERS.map((row) => ({ ...row }));
    }
    if (!Number.isInteger(discountBps) || (discountBps as number) < 0) {
      console.warn("LOYALTY_TIERS is invalid; using the default tiers");
      return DEFAULT_TIERS.map((row) => ({ ...row }));
    }
    if (seen.has(tier)) {
      console.warn("LOYALTY_TIERS is invalid; using the default tiers");
      return DEFAULT_TIERS.map((row) => ({ ...row }));
    }
    seen.add(tier);
    tiers.push({ tier, minSettled: minSettled as number, discountBps: discountBps as number });
  }
  return tiers;
}

export function classifyLoyalty(input: { settledCount: number }): { tier: LoyaltyTier; discountBps: number } {
  const tiers = loyaltyTiers();
  let best: { tier: LoyaltyTier; discountBps: number; minSettled: number; order: number } | null = null;
  for (const [order, row] of tiers.entries()) {
    if (input.settledCount < row.minSettled) continue;
    if (
      !best ||
      row.minSettled > best.minSettled ||
      (row.minSettled === best.minSettled && row.discountBps > best.discountBps) ||
      (row.minSettled === best.minSettled &&
        row.discountBps === best.discountBps &&
        order < best.order)
    ) {
      best = { tier: row.tier, discountBps: row.discountBps, minSettled: row.minSettled, order };
    }
  }
  if (!best) return { tier: "STANDARD", discountBps: 0 };
  if (
    input.settledCount >= 3 &&
    best.tier === "RETURNING" &&
    !tiers.some((row) => row.tier === "LOYAL")
  ) {
    return { tier: "STANDARD", discountBps: 0 };
  }
  return { tier: best.tier, discountBps: best.discountBps };
}

export function appliedAnnualRateBps(baseAnnualRateBps: number, discountBps: number): number {
  return Math.max(0, baseAnnualRateBps - discountBps);
}
