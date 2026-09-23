import { Link } from "react-router-dom";
import { DocumentHead } from "../components/DocumentHead";
import { MarketingShell } from "../components/marketing/MarketingShell";

export function NotFoundPage() {
  return (
    <MarketingShell>
      <DocumentHead
        title="Page not found"
        path="/404"
        description="That page is not on Toumu’a Lending."
      />
      <section className="marketing-wrap py-24 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-primary">404</p>
        <h1 className="mt-4 text-[clamp(36px,4.5vw,52px)] font-bold tracking-tight text-text">
          This page is not here.
        </h1>
        <p className="mx-auto mt-5 max-w-[460px] text-[17px] leading-relaxed text-text-secondary">
          The address may be mistyped, or the page is no longer available.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex h-12 items-center rounded-full bg-primary px-6 text-[15px] font-semibold text-white no-underline"
          >
            Back to home
          </Link>
          <Link
            to="/help"
            className="inline-flex h-12 items-center rounded-full border border-border px-6 text-[15px] font-semibold text-text no-underline"
          >
            Contact
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
