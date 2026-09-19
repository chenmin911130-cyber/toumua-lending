import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DocumentHead } from "../components/DocumentHead";
import { MarketingShell } from "../components/marketing/MarketingShell";
import {
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  CONTACT_HOURS,
  CONTACT_PHONE,
  DISCLAIMER,
  SITE_NAME,
  TAGLINE,
} from "../site";

function LegalArticle({
  title,
  description,
  path,
  children,
}: {
  title: string;
  description: string;
  path: string;
  children: ReactNode;
}) {
  return (
    <MarketingShell>
      <DocumentHead title={title} description={description} path={path} />
      <article className="marketing-wrap max-w-[760px] py-16 md:py-20">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-primary">
          {SITE_NAME}
        </p>
        <h1 className="mt-4 text-[clamp(36px,4.5vw,52px)] font-bold leading-[1.08] tracking-tight text-text">
          {title}
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-text-secondary">{DISCLAIMER}</p>
        <div className="legal-copy mt-10 space-y-5 text-[16px] leading-relaxed text-text-secondary">
          {children}
        </div>
      </article>
    </MarketingShell>
  );
}

export function AboutPage() {
  return (
    <LegalArticle
      title="About"
      path="/about"
      description="Toumu’a Lending is a small Auckland lending office."
    >
      <p>
        {SITE_NAME} is a small Auckland lending office. {TAGLINE}
      </p>
      <p>
        Staff and customers can record a secured loan: apply with collateral, complete a
        valuation, decide the file, take the asset into custody, then disburse and receive
        repayments in the office.
      </p>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-[13px] font-semibold text-text">Office</dt>
          <dd>{CONTACT_ADDRESS}</dd>
        </div>
        <div>
          <dt className="text-[13px] font-semibold text-text">Phone</dt>
          <dd>{CONTACT_PHONE}</dd>
        </div>
        <div>
          <dt className="text-[13px] font-semibold text-text">Email</dt>
          <dd>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </dd>
        </div>
        <div>
          <dt className="text-[13px] font-semibold text-text">Hours</dt>
          <dd>{CONTACT_HOURS}</dd>
        </div>
      </dl>
      <p>
        This website does not publish a Financial Service Provider number or NZBN. Those
        identifiers belong to a licensed business and will only appear here if the office
        supplies them.
      </p>
      <p>
        <Link to="/help">Contact the office</Link> or <Link to="/register">create an account</Link>.
      </p>
    </LegalArticle>
  );
}

export function PrivacyPage() {
  return (
    <LegalArticle
      title="Privacy"
      path="/privacy"
      description="How Toumu’a Lending handles names, emails, and loan-file data."
    >
      <p>
        Accounts store a name, email, password hash, and the loan-file data you enter so we can
        process your application. Do not submit anyone else’s personal information unless it is
        needed for your file.
      </p>
      <p>
        Session cookies (toumua.sid and a CSRF token) keep you signed in. There is no advertising
        tracker and no analytics pixel on this site.
      </p>
      <p>
        To ask for an account to be removed, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalArticle>
  );
}

export function TermsPage() {
  return (
    <LegalArticle
      title="Terms"
      path="/terms"
      description="Terms of use for the Toumu’a Lending website."
    >
      <p>
        By using this website you agree to these terms. Figures, statuses, and receipts on the
        site support your loan file. A written offer from our office confirms the contract,
        security interest, and payment obligation.
      </p>
      <p>
        Keep your login details private. Do not share your password with anyone outside the
        office.
      </p>
      <p>
        The homepage calculator is an illustration only. A formal offer from our office confirms
        rate, fees, and total amount payable in writing.
      </p>
    </LegalArticle>
  );
}

export function ResponsibleLendingPage() {
  return (
    <LegalArticle
      title="Responsible lending"
      path="/responsible-lending"
      description="How Toumu’a Lending talks about borrowing and written offers."
    >
      <p>
        A licensed New Zealand lender must assess suitability and affordability before providing
        consumer credit. Our office records that process before a written offer is made.
      </p>
      <p>
        Estimates on the homepage use a labelled illustrative interest rate so a repayment example
        can be shown. They are not the official office formula and they exclude fees.
      </p>
      <p>
        Repayments are recorded by a cashier in the office. The website does not collect card or
        bank payments.
      </p>
    </LegalArticle>
  );
}

export function DisclosuresPage() {
  return (
    <LegalArticle
      title="Disclosures"
      path="/disclosures"
      description="Credit-disclosure notes for Toumu’a Lending."
    >
      <p>
        This site is not an advertisement for a live credit contract until a written offer is
        made. Product names (personal, vehicle, business) describe loan types, not CCCFA
        disclosure documents.
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>Product name on this website: {SITE_NAME}.</li>
        <li>No FSP number or NZBN is claimed on this website.</li>
        <li>Interest shown in the calculator is a 21% p.a. illustrative estimate.</li>
        <li>Establishment, default, and other fees are not included in that estimate.</li>
        <li>Office contact: {CONTACT_PHONE}, {CONTACT_EMAIL}, {CONTACT_ADDRESS}.</li>
      </ul>
      <p>
        If the office supplies official rates, fees, and licence numbers, those values replace
        the estimates shown here.
      </p>
    </LegalArticle>
  );
}
