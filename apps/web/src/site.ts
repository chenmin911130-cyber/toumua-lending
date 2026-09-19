export const SITE_URL = String(
  import.meta.env.VITE_PUBLIC_SITE_URL ?? "https://web-production-b5acc.up.railway.app",
).replace(/\/$/, "");

export const SITE_NAME = "Toumu’a Lending";
export const LEGAL_ENTITY = "Toumu’a Lending Ltd";
export const CONTACT_PHONE = "021 150 1502";
export const CONTACT_EMAIL = "office@toumua.nz";
export const CONTACT_ADDRESS = "Auckland, New Zealand";
export const CONTACT_HOURS = "Monday–Friday, 9:00am–5:00pm NZST";

export const TAGLINE = "Secured loans for personal, vehicle and business needs.";

export const DEFAULT_DESCRIPTION = TAGLINE;

export const OPERATED_BY = `Operated by ${LEGAL_ENTITY}`;

export const DISCLAIMER = "Loans are arranged with our office. Terms apply.";

export const MARKETING_PATHS = new Set([
  "/",
  "/help",
  "/about",
  "/privacy",
  "/terms",
  "/responsible-lending",
  "/disclosures",
  "/loans",
  "/loans/personal",
  "/loans/vehicle",
  "/loans/business",
]);

export function isMarketingPath(pathname: string): boolean {
  return MARKETING_PATHS.has(pathname) || pathname.startsWith("/loans/");
}

export function isAnonymousAuthPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/staff/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/verify-email" ||
    pathname === "/verify-email/pending" ||
    pathname === "/accept-invitation"
  );
}

export function pageTitle(section?: string): string {
  return section ? `${section} · ${SITE_NAME}` : SITE_NAME;
}
