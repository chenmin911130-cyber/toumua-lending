export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function roleLabel(role: string | null | undefined) {
  if (!role) return "Administrator";
  return role
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const AUCKLAND = "Pacific/Auckland";

function aucklandParts(instant: Date, withTime: boolean) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: AUCKLAND,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error(`Missing ${type} in Pacific/Auckland date`);
    return value;
  };
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: withTime ? Number(read("hour")) % 24 : 0,
    minute: withTime ? Number(read("minute")) : 0,
  };
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

/** Office calendar date, independent of the machine timezone. */
export function aucklandBusinessDate(instant: Date = new Date()) {
  const parts = aucklandParts(instant, false);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** datetime-local value for the Auckland office wall clock. */
export function aucklandDateTimeLocal(instant: Date = new Date()) {
  const parts = aucklandParts(instant, true);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

/**
 * Interprets a datetime-local value as Pacific/Auckland wall time and returns
 * the UTC instant. Machine-local `new Date(value)` would shift the office clock.
 *
 * A spring-forward gap (e.g. 02:30 on the last Sunday in September) does not
 * exist in Auckland, so it is rejected instead of being silently shifted.
 * An ambiguous fall-back time (e.g. 02:30 on the first Sunday in April) occurs
 * twice; deterministically the earlier instant (still NZDT) is returned.
 */
export function aucklandWallTimeToIso(local: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error("Expected Auckland datetime-local YYYY-MM-DDTHH:mm");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || day < 1 || day > 31) {
    throw new Error("That is not a valid Auckland date and time");
  }
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  const roundTrip = new Date(target);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    throw new Error("That is not a valid Auckland calendar date");
  }

  const offsetAt = (instantMs: number) => {
    const whole = Math.floor(instantMs / 60_000) * 60_000;
    const parts = aucklandParts(new Date(whole), true);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - whole;
  };
  const matchesWallTime = (instantMs: number) => {
    const parts = aucklandParts(new Date(instantMs), true);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) === target;
  };

  // Sample both sides of any nearby DST transition so we get every offset a
  // local wall time could map to, then keep only the candidates that round-trip.
  const offsets = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    offsets.add(offsetAt(target + delta * 60 * 60 * 1000));
  }
  const candidates = [...new Set([...offsets].map((offset) => target - offset))]
    .filter(matchesWallTime)
    .sort((a, b) => a - b);

  if (candidates.length === 0) {
    throw new Error("That Auckland time does not exist because the clocks moved forward");
  }
  return new Date(candidates[0] as number).toISOString();
}

/**
 * Schedule dates are stored as UTC midnight of the office business date.
 * Keep that calendar date; do not shift a date-only value through a timezone.
 */
export function businessDateFromStored(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function isDueOnAucklandToday(storedDue: string, now: Date = new Date()) {
  return businessDateFromStored(storedDue) === aucklandBusinessDate(now);
}

export function aucklandDate() {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: AUCKLAND,
  }).format(new Date());
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Pacific/Auckland",
  }).format(date);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Pacific/Auckland",
  }).format(date);
}

export function statusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local[0] ?? ""}••••@${domain}`;
}
