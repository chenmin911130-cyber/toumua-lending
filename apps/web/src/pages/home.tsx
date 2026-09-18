import { DocumentHead } from "../components/DocumentHead";
import { CTASection } from "../components/marketing/CTASection";
import { FAQ } from "../components/marketing/FAQ";
import { Footer } from "../components/marketing/Footer";
import { Hero } from "../components/marketing/Hero";
import { LoanOptions } from "../components/marketing/LoanOptions";
import { Navbar } from "../components/marketing/Navbar";
import { ProcessSteps } from "../components/marketing/ProcessSteps";
import { TrustBar } from "../components/marketing/TrustBar";
import { WhyUs } from "../components/marketing/WhyUs";
import { DEFAULT_DESCRIPTION } from "../site";

export function HomePage() {
  return (
    <div className="marketing-page min-h-screen bg-white font-sans text-text antialiased">
      <DocumentHead description={DEFAULT_DESCRIPTION} path="/" />
      <Navbar />
      <main>
        <Hero />
        <ProcessSteps />
        <LoanOptions />
        <WhyUs />
        <TrustBar />
        <FAQ />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
