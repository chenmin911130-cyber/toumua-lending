import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DocumentHead } from "../components/DocumentHead";
import { MarketingShell } from "../components/marketing/MarketingShell";
import {
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  CONTACT_HOURS,
  CONTACT_PHONE,
  DEMO_NOTICE,
  LEGAL_ENTITY,
  SITE_NAME,
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
          {LEGAL_ENTITY}
        </p>
        <h1 className="mt-4 text-[clamp(36px,4.5vw,52px)] font-bold leading-[1.08] tracking-tight text-text">
          {title}
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-text-secondary">{DEMO_NOTICE}</p>
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
      description="Toumu’a Lending is a COMP721 school workspace built for Toumu’a Money Transfer Ltd, a small Auckland lending office."
    >
      <p>
        {SITE_NAME} is the teaching name for this workspace. The legal entity behind the client
        brief is {LEGAL_ENTITY}, an Auckland money-transfer and lending office.
      </p>
      <p>
        The live site shows how staff and customers can record a secured loan: apply with
        collateral, complete a valuation, decide the file, take the asset into custody, then
        disburse and receive repayments in the office. It is not a production funds system.
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
        This demonstration does not publish a Financial Service Provider number or NZBN. Those
        identifiers belong to a licensed business and will only appear here if the client
        supplies them.
      </p>
      <p>
        <Link to="/help">Contact the office</Link> or <Link to="/register">create a demo account</Link>.
      </p>
    </LegalArticle>
  );
}

export function PrivacyPage() {
  return (
    <LegalArticle
      title="Privacy"
      path="/privacy"
      description="How this COMP721 demonstration handles names, emails, and loan-file data."
    >
      <p>
        Demo accounts store a name, email, password hash, and the loan-file data you enter so the
        workspace can be marked. Do not submit real identity documents, live bank details, or
        anyone else’s personal information.
      </p>
      <p>
        Session cookies (toumua.sid and a CSRF token) keep you signed in. There is no advertising
        tracker and no analytics pixel on this site.
      </p>
      <p>
        School project data may be reset. To ask for a demo account to be removed, email{" "}
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
      description="Terms of use for the Toumu’a Lending COMP721 demonstration website."
    >
      <p>
        By using this website you acknowledge it is a university demonstration. Figures, statuses,
        and receipts are sample records. They do not create a loan contract, security interest, or
        payment obligation.
      </p>
      <p>
        Staff and customer logins are shared teaching accounts unless you register your own demo
        user. Keep the published demo password out of any real-world account.
      </p>
      <p>
        The homepage calculator is an illustration only. A formal offer, if the client later
        operates one, would confirm rate, fees, and total amount payable in writing.
      </p>
    </LegalArticle>
  );
}

export function ResponsibleLendingPage() {
  return (
    <LegalArticle
      title="Responsible lending"
      path="/responsible-lending"
      description="How this demonstration talks about borrowing without presenting a live credit offer."
    >
      <p>
        A licensed New Zealand lender must assess suitability and affordability before providing
        consumer credit. This school workspace records that process; it does not make a regulated
        responsible-lending assessment.
      </p>
      <p>
        Estimates on the homepage use a labelled demo interest rate so a repayment example can be
        shown. They are not Alice’s official office formula and they exclude fees.
      </p>
      <p>
        Repayments on the live demo are recorded by a cashier in the office screens. The website
        does not collect card or bank payments.
      </p>
    </LegalArticle>
  );
}

export function DisclosuresPage() {
  return (
    <LegalArticle
      title="Disclosures"
      path="/disclosures"
      description="Credit-disclosure notes for the Toumu’a Lending school demonstration."
    >
      <p>
        This site is not an advertisement for a live credit contract. Product names (personal,
        vehicle, business) describe demo workflows, not CCCFA disclosure documents.
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>Legal entity in the client brief: {LEGAL_ENTITY}.</li>
        <li>Product name on this website: {SITE_NAME}.</li>
        <li>No FSP number or NZBN is claimed on this demonstration.</li>
        <li>Interest shown in the calculator is a 21% p.a. demo placeholder.</li>
        <li>Establishment, default, and other fees are not included in that estimate.</li>
        <li>Office contact: {CONTACT_PHONE}, {CONTACT_EMAIL}, {CONTACT_ADDRESS}.</li>
      </ul>
      <p>
        If the client later supplies official rates, fees, and licence numbers, those values
        replace the placeholders. Until then they stay labelled as demo data.
      </p>
    </LegalArticle>
  );
}
