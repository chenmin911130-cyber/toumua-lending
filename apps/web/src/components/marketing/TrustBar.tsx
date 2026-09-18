import { Heart, ShieldCheck, Users } from "lucide-react";

function SilverFern({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M12 20.5c0-6.2.3-10.8 1.2-14.2.4-1.5 1-2.7 1.8-3.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12.4 8.2c-1.8-.1-3.6-1.1-4.8-2.4M12.6 10.8c-2.2.2-4.3-.6-5.8-1.9M12.7 13.4c-2.4.4-4.6-.2-6.3-1.4M12.6 16c-2.2.6-4.2.2-5.8-.7M13.2 8.4c1.7-.4 3.3-1.5 4.3-2.8M13.4 11.1c2-.1 3.9-1 5.2-2.3M13.5 13.8c2.1.2 4-.4 5.4-1.6M13.3 16.3c1.9.5 3.6.2 5-.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const TRUST_POINTS = [
  {
    icon: Users,
    title: "Thousands of Kiwis supported since 2020",
  },
  {
    icon: ShieldCheck,
    title: "Transparent lending — no hidden fees",
  },
  {
    icon: SilverFern,
    title: "Proudly New Zealand owned and operated",
  },
  {
    icon: Heart,
    title: "People first — your goals, our priority",
  },
] as const;

export function TrustBar() {
  return (
    <section className="bg-white py-10 md:py-12">
      <div className="marketing-wrap grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        {TRUST_POINTS.map((item) => (
          <div key={item.title} className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center text-primary">
              <item.icon className="h-6 w-6" strokeWidth={1.7} />
            </span>
            <p className="text-[14px] font-medium leading-snug text-text-secondary">{item.title}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
