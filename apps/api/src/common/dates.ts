const AUCKLAND = "Pacific/Auckland";

/** Calendar day in the Auckland office timezone, as YYYY-MM-DD. */
export function aucklandDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: AUCKLAND,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Adds whole calendar days to a YYYY-MM-DD date. Arithmetic stays in the
 * date parts so a daylight-saving change cannot move the result by a day.
 */
export function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error("Expected a YYYY-MM-DD date");
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Lead time for a DUE_SOON reminder. Not a money value. */
export function reminderDaysBefore(): number {
  const raw = process.env.REMINDER_DAYS_BEFORE ?? "3";
  if (!/^\d+$/.test(raw)) return 3;
  const days = Number(raw);
  return days > 0 ? days : 3;
}
