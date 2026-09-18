import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@toumua/ui";
import { api } from "./api";
import { useAuth } from "./auth";
import { GlobalSearch } from "./components/GlobalSearch";
import { OfflineBanner } from "./components/OfflineBanner";
import { initials, roleLabel } from "./format";
import { isMarketingPath } from "./site";

const SPLIT_AUTH = new Set(["/login", "/staff/login", "/register", "/accept-invitation"]);
const SIMPLE_AUTH = new Set([
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-email/pending",
]);

function useSignOut(staff?: boolean) {
  const { clearProtectedCache } = useAuth();
  const navigate = useNavigate();
  return async () => {
    await api("/auth/logout", { method: "POST" });
    clearProtectedCache();
    navigate(staff ? "/staff/login" : "/login");
  };
}

function AccountMenu({ staff }: { staff?: boolean }) {
  const { user } = useAuth();
  const signOut = useSignOut(staff);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!user) return null;
  return (
    <div ref={ref} className="account-anchor">
      <button
        type="button"
        className="avatar-chip"
        data-control-id="GLOBAL-06"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`avatar-circle${staff ? " avatar-circle-staff" : ""}`}>{initials(user.name)}</span>
        <span>{user.name}</span>
      </button>
      {open ? (
        <div id="account-menu" className="menu">
          <NavLink to="/account" data-control-id="GLOBAL-05" onClick={() => setOpen(false)}>
            Your account
          </NavLink>
          <button type="button" data-control-id="GLOBAL-07" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PublicLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const split = SPLIT_AUTH.has(location.pathname);
  const simple = SIMPLE_AUTH.has(location.pathname);

  if (split) return <Outlet />;

  if (
    isMarketingPath(location.pathname) &&
    !(location.pathname === "/help" && user && !user.isStaff && !user.restrictedSession)
  ) {
    return <Outlet />;
  }

  if (location.pathname === "/help" && user && !user.isStaff && !user.restrictedSession) {
    return (
      <div>
        <header className="customer-header">
          <div className="header-left">
            <Logo to="/customer" />
            <nav className="nav-links">
              <NavLink to="/customer" end data-control-id="GLOBAL-02">My overview</NavLink>
              <NavLink to="/customer/applications">Application</NavLink>
              <NavLink to="/customer/loans">My loans</NavLink>
              <NavLink to="/notifications">Notifications</NavLink>
              <NavLink to="/help">Help</NavLink>
            </nav>
          </div>
          <AccountMenu />
        </header>
        <Outlet />
      </div>
    );
  }

  if (simple) {
    return (
      <div>
        <header className="simple-header">
          <Logo to="/" />
          <NavLink to="/login" data-control-id="A04-03">Back to login</NavLink>
        </header>
        <Outlet />
      </div>
    );
  }

  return (
    <div>
      <header className="public-header">
        <div className="header-left">
          <Logo to="/" />
          <nav className="nav-links">
            <a href="/#how-it-works" data-control-id="C01-01">How it works</a>
            <NavLink to="/login" data-control-id="C01-02">My loan</NavLink>
            <NavLink to="/help" data-control-id="C01-03">Contact</NavLink>
          </nav>
        </div>
        <div className="header-right">
          <NavLink className="btn btn-secondary" to="/login">Log in</NavLink>
          <NavLink className="btn btn-primary" to="/help" data-control-id="C01-03">Contact our team</NavLink>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

export function CustomerLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true, state: { from: location.pathname } });
      return;
    }
    if (user.restrictedSession || !user.emailVerified) {
      navigate("/verify-email/pending", { replace: true });
    }
  }, [user, loading, navigate, location.pathname]);

  if (!user || user.restrictedSession) return null;
  return (
    <div>
      <OfflineBanner />
      <header className="customer-header">
        <div className="header-left">
          <Logo to="/customer" />
          <nav className="nav-links">
            <NavLink to="/customer" end data-control-id="GLOBAL-02">My overview</NavLink>
            <NavLink to="/customer/applications">Application</NavLink>
            <NavLink to="/customer/loans">My loans</NavLink>
            <NavLink to="/notifications">Notifications</NavLink>
            <NavLink to="/help">Help</NavLink>
          </nav>
        </div>
        <AccountMenu />
      </header>
      <Outlet />
    </div>
  );
}

export function AccountLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <PublicLayout />;
  return user.isStaff ? <StaffLayout /> : <CustomerLayout />;
}

const STAFF_NAV = [
  { to: "/staff", label: "Overview", controlId: "GLOBAL-03", end: true },
  { to: "/staff/borrowers", label: "Borrowers" },
  { to: "/staff/applications", label: "Applications" },
  { to: "/staff/loans", label: "Loans" },
  { to: "/staff/collateral", label: "Collateral" },
  { to: "/staff/transactions", label: "Transactions" },
];

export function StaffLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const signOut = useSignOut(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/staff/login", { replace: true });
      return;
    }
    if (!user.isStaff) {
      navigate("/customer", { replace: true });
    }
  }, [user, loading, navigate]);

  if (!user?.isStaff) return null;
  return (
    <div className="staff-shell">
      <aside className="staff-sidebar">
        <NavLink to="/staff" className="staff-brand" data-control-id="GLOBAL-01">
          <span className="staff-mark">T</span>
          <span>
            <strong>Toumu’a</strong>
            <div className="staff-sub">Lending workspace</div>
          </span>
        </NavLink>
        <nav className="staff-nav">
          <GlobalSearch />
          {STAFF_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-control-id={item.controlId}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="staff-side-foot">
          <nav className="staff-nav">
            {user.role === "MANAGER" || user.permissions.includes("manage_staff") ? (
              <NavLink to="/staff/admin/accounts" data-control-id="GLOBAL-04">Staff accounts</NavLink>
            ) : null}
            {user.permissions.includes("view_audit") ? (
              <NavLink to="/staff/admin/activity">Activity log</NavLink>
            ) : null}
            <NavLink to="/account">Settings</NavLink>
            <NavLink to="/notifications">Notifications</NavLink>
            <button
              type="button"
              className="staff-nav-button"
              data-control-id="GLOBAL-07"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </nav>
          <AccountMenu staff />
          <div className="staff-sub" style={{ padding: "8px 12px 0" }}>{roleLabel(user.role)}</div>
        </div>
      </aside>
      <div className="staff-main">
        <OfflineBanner />
        <header className="staff-mobile-bar">
          <Logo to="/staff" />
          <AccountMenu staff />
        </header>
        <Outlet />
      </div>
    </div>
  );
}
