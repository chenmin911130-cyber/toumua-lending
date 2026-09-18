import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Navbar } from "./Navbar";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-page min-h-screen bg-white font-sans text-text antialiased">
      <Navbar />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
