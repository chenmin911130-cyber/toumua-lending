import { Heart, ShieldCheck, Sprout, Users } from "lucide-react";

const TRUST_POINTS = [
  {
    icon: Users,
    title: "Thousands of Kiwis supported since 2020",
    description: "Real people when you need help",
  },
  {
    icon: ShieldCheck,
    title: "Transparent lending — no hidden fees",
    description: "Clear information",
  },
  {
    icon: Sprout,
    title: "Proudly New Zealand owned and operated",
    description: "Built for local customers",
  },
  {
    icon: Heart,
    title: "People first — your goals, our priority",
    description: "Your goals matter",
  },
] as const;

export function TrustBar() {
  return (
    <section className="border-y border-border bg-white py-12 md:py-14">
      <div className="mx-auto grid max-w-[1280px] gap-8 px-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6 lg:px-12">
        {TRUST_POINTS.map((item) => (
          <div key={item.title} className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-green-icon text-primary">
              <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
            </span>
            <div>
              <p className="text-[14px] font-semibold leading-snug text-text">{item.title}</p>
              <p className="mt-1 text-[13px] text-text-muted">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
