/**
 * Strips spaces and hyphens. A leading 0 becomes the New Zealand country
 * code. Anything that is not `+` followed by 8–15 digits is not sendable.
 */
export function normalizeSmsPhone(raw: string): string | null {
  const compact = raw.replace(/[\s-]/g, "");
  const withCountry = compact.startsWith("0") ? `+64${compact.slice(1)}` : compact;
  if (!/^\+\d{8,15}$/.test(withCountry)) return null;
  return withCountry;
}

/** Country code, the next two digits, and the last three. The middle stays hidden. */
export function maskSmsPhone(phone: string): string {
  const normalized = normalizeSmsPhone(phone);
  if (!normalized) return "***";
  const last = normalized.slice(-3);
  if (normalized.startsWith("+64") && normalized.length >= 8) {
    const prefix = normalized.slice(3, 5);
    return `+64 ${prefix} *** ${last}`;
  }
  return `${normalized.slice(0, 3)} *** ${last}`;
}
