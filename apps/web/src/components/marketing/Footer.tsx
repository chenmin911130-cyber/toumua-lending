import { Link } from "react-router-dom";
import { MarketingLogo } from "./MarketingLogo";
import {
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  CONTACT_PHONE,
  DISCLAIMER,
  OPERATED_BY,
  TAGLINE,
} from "../../site";

const FOOTER_LINKS = {
  loans: [
    { label: "Personal loan", to: "/loans/personal" },
    { label: "Vehicle finance", to: "/loans/vehicle" },
    { label: "Business finance", to: "/loans/business" },
  ],
  company: [
    { label: "About", to: "/about" },
    { label: "Contact", to: "/help" },
    { label: "FAQ", to: "/help" },
  ],
  legal: [
    { label: "Privacy", to: "/privacy" },
    { label: "Terms", to: "/terms" },
    { label: "Responsible lending", to: "/responsible-lending" },
    { label: "Disclosures", to: "/disclosures" },
  ],
} as const;

export function Footer() {
  return (
    <footer className="border-t border-border bg-white pt-14 pb-8">
      <div className="marketing-wrap grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <MarketingLogo />
          <p className="mt-4 max-w-[280px] text-[14px] leading-relaxed text-text-secondary">
            {TAGLINE}
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
            {CONTACT_ADDRESS}
            <br />
            <a href={`tel:${CONTACT_PHONE.replace(/\s/g, "")}`} className="text-text-secondary">
              {CONTACT_PHONE}
            </a>
            <br />
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-text-secondary">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>

        <div>
          <h2 className="text-[14px] font-semibold text-text">Loans</h2>
          <ul className="mt-4 space-y-3">
            {FOOTER_LINKS.loans.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  className="text-[14px] text-text-secondary no-underline hover:text-text"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[14px] font-semibold text-text">Company</h2>
          <ul className="mt-4 space-y-3">
            {FOOTER_LINKS.company.map((item) =>
              item.to.startsWith("/#") ? (
                <li key={item.label}>
                  <a
                    href={item.to}
                    className="text-[14px] text-text-secondary no-underline hover:text-text"
                  >
                    {item.label}
                  </a>
                </li>
              ) : (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="text-[14px] text-text-secondary no-underline hover:text-text"
                  >
                    {item.label}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </div>

        <div>
          <h2 className="text-[14px] font-semibold text-text">Legal</h2>
          <ul className="mt-4 space-y-3">
            {FOOTER_LINKS.legal.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.to}
                  className="text-[14px] text-text-secondary no-underline hover:text-text"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="marketing-wrap mt-12 space-y-2 border-t border-border pt-6">
        <p className="text-[13px] text-text-muted">© 2026 Toumu’a Lending.</p>
        <p className="text-[13px] text-text-muted">{OPERATED_BY}</p>
        <p className="max-w-[720px] text-[13px] leading-relaxed text-text-muted">{DISCLAIMER}</p>
      </div>
    </footer>
  );
}
