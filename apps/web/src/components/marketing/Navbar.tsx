import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { MarketingLogo } from "./MarketingLogo";

const NAV_LINKS = [
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/help" },
  { label: "Contact", href: "/help" },
] as const;

const LOAN_LINKS = [
  { label: "Vehicle finance", href: "/loans/vehicle" },
  { label: "Personal loan", href: "/loans/personal" },
  { label: "Business finance", href: "/loans/business" },
] as const;

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loansOpen, setLoansOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white">
        <div className="marketing-wrap grid h-[80px] grid-cols-[1fr_auto] items-center md:grid-cols-[1fr_auto_1fr]">
          <MarketingLogo className="justify-self-start" />

          <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
            <div
              className="relative"
              onMouseEnter={() => setLoansOpen(true)}
              onMouseLeave={() => setLoansOpen(false)}
            >
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[15px] font-medium text-text-secondary transition-colors hover:text-text"
                aria-expanded={loansOpen}
                aria-controls="loans-menu"
              >
                Loans
                <ChevronDown className="h-4 w-4" strokeWidth={1.8} aria-hidden />
              </button>
              <AnimatePresence>
                {loansOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.16 }}
                    id="loans-menu"
                    className="absolute left-1/2 top-full z-20 w-[220px] -translate-x-1/2 pt-3"
                  >
                    <div className="rounded-[16px] border border-border bg-white p-2 shadow-card">
                      {LOAN_LINKS.map((item) => (
                        <Link
                          key={item.label}
                          to={item.href}
                          className="block rounded-[10px] px-3 py-2.5 text-[14px] font-medium text-text-secondary no-underline hover:bg-bg-warm hover:text-text"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
            {NAV_LINKS.map((item) =>
              item.href.startsWith("/#") ? (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-[15px] font-medium text-text-secondary no-underline transition-colors hover:text-text"
                >
                  {item.label}
                </a>
              ) : (
                <NavLink
                  key={item.label}
                  to={item.href}
                  className={({ isActive }) =>
                    `text-[15px] font-medium no-underline transition-colors hover:text-text ${
                      isActive ? "text-text" : "text-text-secondary"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>

          <div className="hidden items-center justify-end gap-3 md:flex">
            <Link
              to="/login"
              className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-white px-5 text-[15px] font-semibold text-text no-underline transition-all hover:-translate-y-px hover:border-text-muted/30"
              data-control-id="C01-02"
            >
              Log in
            </Link>
            <Link
              to="/login"
              className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-[15px] font-semibold text-white no-underline transition-all hover:-translate-y-px hover:bg-primary-hover"
            >
              Get started
            </Link>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center justify-self-end rounded-full border border-border text-text md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <Menu className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen ? (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-50 bg-text/20 md:hidden"
              aria-label="Close menu overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              id="mobile-nav"
              className="fixed inset-y-0 right-0 z-50 flex w-[min(320px,88vw)] flex-col bg-white shadow-card md:hidden"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <div className="flex h-[72px] items-center justify-between border-b border-border px-5">
                <MarketingLogo />
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                >
                  <X className="h-5 w-5" strokeWidth={1.8} />
                </button>
              </div>
              <nav className="flex flex-1 flex-col gap-1 p-5" aria-label="Mobile">
                <p className="px-3 py-2 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
                  Loans
                </p>
                {LOAN_LINKS.map((item) => (
                  <Link
                    key={item.label}
                    to={item.href}
                    className="rounded-[10px] px-3 py-3 text-[16px] font-medium text-text no-underline hover:bg-bg-warm"
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
                {NAV_LINKS.map((item) =>
                  item.href.startsWith("/#") ? (
                    <a
                      key={item.label}
                      href={item.href}
                      className="rounded-[10px] px-3 py-3 text-[16px] font-medium text-text no-underline hover:bg-bg-warm"
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.label}
                    </a>
                  ) : (
                    <NavLink
                      key={item.label}
                      to={item.href}
                      className="rounded-[10px] px-3 py-3 text-[16px] font-medium text-text no-underline hover:bg-bg-warm"
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.label}
                    </NavLink>
                  ),
                )}
              </nav>
              <div className="space-y-3 border-t border-border p-5">
                <Link
                  to="/login"
                  className="flex h-11 w-full items-center justify-center rounded-full border border-border text-[15px] font-semibold text-text no-underline"
                  onClick={() => setMenuOpen(false)}
                >
                  Log in
                </Link>
                <Link
                  to="/login"
                  className="flex h-11 w-full items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-white no-underline"
                  onClick={() => setMenuOpen(false)}
                >
                  Get started
                </Link>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
