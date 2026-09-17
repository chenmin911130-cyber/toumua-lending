/**
 * Exact decimal money arithmetic.
 *
 * Money is stored and moved around as a string with at most two decimal places
 * and computed in integer minor units (cents). JavaScript numbers must never
 * touch a monetary value: 0.1 + 0.2 !== 0.3, and a rounding drift in a ledger is
 * a real loss of someone's money.
 */

/**
 * Accepts an optional sign and one or two decimals. Input may be written loosely
 * ("1200", "1200.5"), but nothing this module returns is loose: fromCents always
 * renders canonical two-decimal text such as "1200.50".
 */
const AMOUNT_PATTERN = /^-?\d+(\.\d{1,2})?$/;

export class MoneyError extends Error {}

/** Parses "1234.50" style input into integer cents. Throws on anything else. */
export function toCents(amount: string): number {
  const value = amount.trim();
  if (!AMOUNT_PATTERN.test(value)) {
    throw new MoneyError(`Invalid monetary amount: ${JSON.stringify(amount)}`);
  }
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = digits.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

/** Renders integer cents back into the canonical two-decimal string. */
export function fromCents(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new MoneyError(`Cents must be an integer, received ${cents}`);
  }
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function isAmount(value: string): boolean {
  return AMOUNT_PATTERN.test(value.trim());
}

export function add(a: string, b: string): string {
  return fromCents(toCents(a) + toCents(b));
}

export function subtract(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

export function sum(amounts: readonly string[]): string {
  return fromCents(amounts.reduce((total, amount) => total + toCents(amount), 0));
}

export function negate(a: string): string {
  return fromCents(-toCents(a));
}

/** -1, 0 or 1. */
export function compare(a: string, b: string): number {
  const left = toCents(a);
  const right = toCents(b);
  return left === right ? 0 : left < right ? -1 : 1;
}

export function isZero(a: string): boolean {
  return toCents(a) === 0;
}

export function isPositive(a: string): boolean {
  return toCents(a) > 0;
}

export function isNegative(a: string): boolean {
  return toCents(a) < 0;
}

export function min(a: string, b: string): string {
  return compare(a, b) <= 0 ? fromCents(toCents(a)) : fromCents(toCents(b));
}

export function max(a: string, b: string): string {
  return compare(a, b) >= 0 ? fromCents(toCents(a)) : fromCents(toCents(b));
}

/** Canonicalises "1200" or "1200.5" into "1200.00" / "1200.50". */
export function normalize(amount: string): string {
  return fromCents(toCents(amount));
}

/**
 * Splits a total into `periods` equal parts without losing or inventing a cent.
 * The remainder is added to the final part, which is why the last installment
 * can differ by a cent or two from the others (explicitly allowed by the design
 * so that the parts always add up to the total).
 */
export function splitEvenly(total: string, periods: number): string[] {
  if (!Number.isInteger(periods) || periods <= 0) {
    throw new MoneyError(`Periods must be a positive integer, received ${periods}`);
  }
  const cents = toCents(total);
  if (cents < 0) {
    throw new MoneyError("Cannot split a negative total");
  }
  const base = Math.floor(cents / periods);
  const parts: string[] = [];
  for (let index = 0; index < periods; index += 1) {
    parts.push(fromCents(base));
  }
  const allocated = base * periods;
  const remainder = cents - allocated;
  if (remainder > 0) {
    parts[periods - 1] = fromCents(base + remainder);
  }
  return parts;
}
