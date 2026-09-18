import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function FeatureItem({ icon: Icon, title, description }: Props) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bg-green-icon text-primary">
        <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
      </span>
      <div>
        <p className="text-[15px] font-semibold text-text">{title}</p>
        <p className="mt-0.5 text-[14px] leading-snug text-text-muted">{description}</p>
      </div>
    </div>
  );
}
