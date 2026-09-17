import { Link } from "react-router-dom";

type Props = {
  to: string;
  light?: boolean;
};

export function Logo({ to, light }: Props) {
  return (
    <Link to={to} className="logo serif" data-control-id="GLOBAL-01" style={{ color: light ? "white" : "#10263B" }}>
      Toumu’a
    </Link>
  );
}
