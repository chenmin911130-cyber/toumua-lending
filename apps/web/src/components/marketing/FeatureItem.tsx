import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: "light" | "dark";
};

export function FeatureItem({ icon: Icon, title, description, tone = "light" }: Props) {
  const dark = tone === "dark";
  return (
    <div className="flex items-start gap-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          dark ? "bg-white/10 text-white" : "bg-[#eaf3ee] text-primary"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
      </span>
      <div>
        <p className={`text-[14px] font-semibold ${dark ? "text-white" : "text-text"}`}>{title}</p>
        <p className={`mt-0.5 text-[13px] leading-snug ${dark ? "text-[#d7e2ea]" : "text-text-muted"}`}>
          {description}
        </p>
      </div>
    </div>
  );
}
