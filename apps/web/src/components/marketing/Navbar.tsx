import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { MarketingLogo } from "./MarketingLogo";

const NAV_LINKS = [
  { label: "About", to: "/about", href: undefined },
  { label: "FAQ", to: undefined, href: "/#faq" },
  { label: "Contact", to: "/help", href: undefined },
] as const;

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-white/95 backdrop-blur-[16px]">
        <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between px-6 lg:px-12">
          <MarketingLogo />

          <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[15px] font-medium text-text-secondary transition-colors hover:text-text"
            >
              Loans
              <ChevronDown className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            </button>
            {NAV_LINKS.map((item) =>
              item.href ? (
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
                  to={item.to!}
                  className="text-[15px] font-medium text-text-secondary no-underline transition-colors hover:text-text"
                >
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              to="/login"
              className="inline-flex h-11 items-center justify-center rounded-[10px] border border-border bg-white px-5 text-[15px] font-semibold text-text no-underline transition-all hover:-translate-y-px hover:border-text-muted/30"
              data-control-id="C01-02"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="inline-flex h-11 items-center justify-center rounded-[10px] bg-primary px-5 text-[15px] font-semibold text-white no-underline transition-all hover:-translate-y-px hover:bg-primary-hover"
            >
              Get started
            </Link>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-border text-text md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen(true)}
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-border"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                >
                  <X className="h-5 w-5" strokeWidth={1.8} />
                </button>
              </div>
              <nav className="flex flex-1 flex-col gap-1 p-5" aria-label="Mobile">
                <span className="px-3 py-3 text-[15px] font-medium text-text-secondary">Loans</span>
                {NAV_LINKS.map((item) =>
                  item.href ? (
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
                      to={item.to!}
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
                  className="flex h-11 w-full items-center justify-center rounded-[10px] border border-border text-[15px] font-semibold text-text no-underline"
                  onClick={() => setMenuOpen(false)}
                >
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="flex h-11 w-full items-center justify-center rounded-[10px] bg-primary text-[15px] font-semibold text-white no-underline"
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
