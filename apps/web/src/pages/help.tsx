import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Clock, Mail, MapPin, Phone } from "lucide-react";
import { motion } from "framer-motion";
import { api, type ContactResponse } from "../api";
import { useAuth } from "../auth";
import { FAQItem } from "../components/marketing/FAQ";
import { Footer } from "../components/marketing/Footer";
import { Navbar } from "../components/marketing/Navbar";

const HELP_FAQS = [
  {
    q: "How do I apply?",
    a: "Sign in and apply online. Include the amount you need and the security you can offer. Staff review the application and value the collateral before a manager decides.",
  },
  {
    q: "Where do I make repayments?",
    a: "Repayments are recorded by our cashier in the office. This website does not take online payments.",
  },
  {
    q: "When is my security returned?",
    a: "Security is returned after the loan balance is cleared, or recorded as sold if a default sale is completed.",
  },
  {
    q: "How can I check my application?",
    a: "Sign in to apply or to check the progress of an application you have already submitted.",
  },
] as const;

const STEPS = [
  { num: "01", title: "Apply online", description: "Submit the amount you need and the security you can offer." },
  { num: "02", title: "Valuation", description: "Your security assets are reviewed before a decision." },
  { num: "03", title: "Manager decision", description: "Our team assesses the application and next steps." },
  { num: "04", title: "Security intake, then disbursement", description: "Once approved, security is taken in and funds are released." },
] as const;

function HelpContent() {
  const { user } = useAuth();
  const [contact, setContact] = useState<ContactResponse | null>(null);

  useEffect(() => {
    void api<ContactResponse>("/public/contact").then(setContact);
  }, []);

  const hasDetails = Boolean(contact?.phone || contact?.email || contact?.address);
  const applicationHref = user && !user.isStaff && !user.restrictedSession ? "/customer" : "/login";

  return (
    <>
      <section className="bg-white py-16 md:py-20 lg:py-[88px]">
        <div className="marketing-wrap">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-primary">Contact</p>
          <h1 className="mt-4 max-w-[720px] text-[clamp(40px,5vw,64px)] font-bold leading-[1.05] tracking-[-0.03em] text-text">
            We&apos;re here to help.
          </h1>
          <p className="mt-5 max-w-[540px] text-[17px] leading-[1.65] text-text-secondary">
            Speak with your loan officer about your application, repayments or security assets.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#officer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-white no-underline transition-all hover:-translate-y-px hover:bg-primary-hover"
              data-control-id="C01-03"
            >
              Contact our team
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </a>
            <Link
              to={applicationHref}
              className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-white px-6 text-[15px] font-semibold text-text no-underline transition-all hover:-translate-y-px hover:border-text-muted/30"
              data-control-id="C01-02"
            >
              View my application
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[#f4f7f4] py-16 md:py-20 lg:py-[88px]">
        <div className="marketing-wrap grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.8fr)] lg:items-start lg:gap-16">
          <div>
            <h2 className="text-[clamp(28px,3.2vw,36px)] font-bold tracking-tight text-text">
              Common questions
            </h2>
            <div className="mt-8">
              {HELP_FAQS.map((item) => (
                <FAQItem key={item.q} question={item.q} answer={item.a} />
              ))}
            </div>
          </div>

          <aside id="officer" className="rounded-[20px] bg-white p-6 shadow-[0_8px_24px_rgba(16,24,40,0.05)] sm:p-7">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">
              Your loan officer
            </p>
            <h3 className="mt-3 text-[22px] font-semibold text-text">Talk with our team</h3>
            {hasDetails ? (
              <ul className="mt-5 space-y-3">
                {contact?.phone ? (
                  <li className="flex items-start gap-3 text-[15px] text-text-secondary">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
                    {contact.phone}
                  </li>
                ) : null}
                {contact?.email ? (
                  <li className="flex items-start gap-3 text-[15px] text-text-secondary">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
                    {contact.email}
                  </li>
                ) : null}
                {contact?.address ? (
                  <li className="flex items-start gap-3 text-[15px] text-text-secondary">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
                    {contact.address}
                  </li>
                ) : null}
                {contact?.hours ? (
                  <li className="flex items-start gap-3 text-[15px] text-text-secondary">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.8} aria-hidden />
                    {contact.hours}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-4 text-[15px] leading-relaxed text-text-secondary">
                {contact?.note ?? "Please use the contact details provided with your loan agreement."}
              </p>
            )}

            <Link
              to={applicationHref}
              className="mt-6 inline-flex items-center gap-1 text-[15px] font-semibold text-primary no-underline hover:text-primary-hover"
            >
              View my application
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>

            <div className="mt-6 rounded-[16px] bg-[#f6f7f6] p-4">
              <p className="text-[15px] font-semibold text-text">Need to update your details?</p>
              <p className="mt-1 text-[14px] leading-relaxed text-text-secondary">
                Contact our team to update the information on your loan record.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="bg-white py-16 md:py-20 lg:py-[88px]">
        <div className="marketing-wrap">
          <h2 className="text-[clamp(28px,3.2vw,36px)] font-bold tracking-tight text-text">How it works</h2>
          <p className="mt-3 max-w-[520px] text-[17px] leading-relaxed text-text-secondary">
            A straightforward process from application to disbursement.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <motion.article
                key={step.num}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.4, delay: index * 0.06 }}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f3f4f6] text-[13px] font-semibold text-text-muted">
                  {step.num}
                </span>
                <h3 className="mt-4 text-[18px] font-semibold text-text">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{step.description}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function HelpPage() {
  const { user } = useAuth();
  const inCustomerApp = Boolean(user && !user.isStaff && !user.restrictedSession);

  if (inCustomerApp) {
    return (
      <div className="marketing-page bg-white font-sans text-text antialiased">
        <HelpContent />
      </div>
    );
  }

  return (
    <div className="marketing-page min-h-screen bg-white font-sans text-text antialiased">
      <Navbar />
      <main>
        <HelpContent />
      </main>
      <Footer />
    </div>
  );
}
