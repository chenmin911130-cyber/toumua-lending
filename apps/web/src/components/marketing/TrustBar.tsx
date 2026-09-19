import { Heart, Landmark, ShieldCheck, Users } from "lucide-react";

const TRUST_POINTS = [
  {
    icon: Landmark,
    title: "Auckland office lending",
  },
  {
    icon: ShieldCheck,
    title: "Rates and fees confirmed on a written offer",
  },
  {
    icon: Users,
    title: "A New Zealand lending office",
  },
  {
    icon: Heart,
    title: "Talk with the team about your options",
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
