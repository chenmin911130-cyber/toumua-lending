import { Logo } from "@toumua/ui";

type Props = {
  to?: string;
  className?: string;
};

export function MarketingLogo({ to = "/", className = "" }: Props) {
  return <Logo to={to} className={className} />;
}
