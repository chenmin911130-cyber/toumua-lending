import { Link } from "react-router-dom";
import { MarketingLogo } from "./MarketingLogo";

const FOOTER_LINKS = {
  loans: [
    { label: "Personal Loan", to: "/help" },
    { label: "Vehicle Finance", to: "/help" },
    { label: "Business Finance", to: "/help" },
  ],
  company: [
    { label: "About", to: "/help" },
    { label: "Contact", to: "/help" },
    { label: "FAQ", to: "/#faq" },
  ],
  legal: [
    { label: "Privacy", to: "/help" },
    { label: "Terms", to: "/help" },
    { label: "Responsible Lending", to: "/help" },
    { label: "Disclosures", to: "/help" },
  ],
} as const;

export function Footer() {
  return (
    <footer className="border-t border-border bg-white pt-14 pb-8">
      <div className="marketing-wrap grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <MarketingLogo />
          <p className="mt-4 max-w-[260px] text-[14px] leading-relaxed text-text-secondary">
            Simple, transparent finance built around people across New Zealand.
          </p>
        </div>

        <div>
          <h3 className="text-[14px] font-semibold text-text">Loans</h3>
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
          <h3 className="text-[14px] font-semibold text-text">Company</h3>
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
          <h3 className="text-[14px] font-semibold text-text">Legal</h3>
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

      <div className="marketing-wrap mt-12 border-t border-border pt-6">
        <p className="text-[13px] text-text-muted">© Toumu&apos;a Lending</p>
      </div>
    </footer>
  );
}
