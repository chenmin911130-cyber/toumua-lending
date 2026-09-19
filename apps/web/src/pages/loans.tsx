import { Link } from "react-router-dom";
import { DocumentHead } from "../components/DocumentHead";
import { MarketingShell } from "../components/marketing/MarketingShell";
import { DISCLAIMER } from "../site";

const PRODUCTS = [
  {
    slug: "personal",
    title: "Personal loan",
    summary: "A secured personal loan recorded in the office, with collateral held until the balance is cleared.",
    points: [
      "Apply online with the amount you need and the security you can offer.",
      "Staff review the file; larger or complex applications go to a manager.",
      "Repayments are taken by the cashier. This website does not take online payments.",
    ],
  },
  {
    slug: "vehicle",
    title: "Vehicle finance",
    summary: "The same secured-lending workflow, with a vehicle used as security.",
    points: [
      "Record the vehicle in the application as a security asset, with photos.",
      "A valuation officer completes the valuation before a decision.",
      "After settlement the asset can be marked returned; after default it may be recorded as sold.",
    ],
  },
  {
    slug: "business",
    title: "Business finance",
    summary: "Office lending for a small-business purpose, still using the secured application and custody process.",
    points: [
      "Purpose and supporting notes travel with the application for the reviewer.",
      "Complex files — including an “Other” purpose — require a manager decision.",
      "Rates and fees on a real facility would be confirmed in a written offer.",
    ],
  },
] as const;

export function LoansIndexPage() {
  return (
    <MarketingShell>
      <DocumentHead
        title="Loan options"
        path="/loans"
        description="Personal, vehicle, and business secured loans from Toumu’a Lending."
      />
      <section className="marketing-wrap py-16 md:py-20">
        <h1 className="text-[clamp(36px,4.5vw,52px)] font-bold tracking-tight text-text">
          Loan options
        </h1>
        <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-text-secondary">
          {DISCLAIMER}
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PRODUCTS.map((product) => (
            <Link
              key={product.slug}
              to={`/loans/${product.slug}`}
              className="rounded-[18px] bg-[#f6f7f6] p-6 no-underline transition-all hover:-translate-y-[3px]"
            >
              <h2 className="text-[19px] font-semibold text-text">{product.title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{product.summary}</p>
              <span className="mt-5 inline-block text-[15px] font-semibold text-primary">Read more</span>
            </Link>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}

export function LoanProductPage({ slug }: { slug: (typeof PRODUCTS)[number]["slug"] }) {
  const product = PRODUCTS.find((item) => item.slug === slug);
  if (!product) return null;
  return (
    <MarketingShell>
      <DocumentHead
        title={product.title}
        path={`/loans/${product.slug}`}
        description={product.summary}
      />
      <article className="marketing-wrap max-w-[760px] py-16 md:py-20">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-primary">
          <Link to="/loans" className="text-primary no-underline">
            Loan options
          </Link>
        </p>
        <h1 className="mt-4 text-[clamp(36px,4.5vw,52px)] font-bold tracking-tight text-text">
          {product.title}
        </h1>
        <p className="mt-5 text-[17px] leading-relaxed text-text-secondary">{product.summary}</p>
        <ul className="mt-8 list-disc space-y-3 pl-5 text-[16px] leading-relaxed text-text-secondary">
          {product.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="mt-8 text-[15px] text-text-secondary">{DISCLAIMER}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/login"
            className="inline-flex h-12 items-center rounded-full bg-primary px-6 text-[15px] font-semibold text-white no-underline"
          >
            Get started
          </Link>
          <Link
            to="/help"
            className="inline-flex h-12 items-center rounded-full border border-border px-6 text-[15px] font-semibold text-text no-underline"
          >
            Talk to us
          </Link>
        </div>
      </article>
    </MarketingShell>
  );
}

export function PersonalLoanPage() {
  return <LoanProductPage slug="personal" />;
}

export function VehicleLoanPage() {
  return <LoanProductPage slug="vehicle" />;
}

export function BusinessLoanPage() {
  return <LoanProductPage slug="business" />;
}
