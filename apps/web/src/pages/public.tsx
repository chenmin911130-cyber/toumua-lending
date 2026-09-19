import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Field, Logo, PasswordField } from "@toumua/ui";
import { api, errorMessage, fieldError, type MeResponse } from "../api";
import { useAuth } from "../auth";
import { maskEmail } from "../format";
import { DocumentHead } from "../components/DocumentHead";

function AuthSplit({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-split">
      <aside className="auth-brand">
        <Logo to="/" />
        <div>
          <p className="auth-brand-kicker">Real opportunities. A brighter tomorrow.</p>
          <p className="auth-brand-title">{title}</p>
          <p>{body}</p>
        </div>
        <p className="auth-brand-foot">Toumu’a Lending</p>
      </aside>
      <section className="auth-form">
        <div className="auth-form-inner">{children}</div>
      </section>
    </div>
  );
}

function LoginForm({ staff }: { staff?: boolean }) {
  const { setUser, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!user || user.restrictedSession) return;
    if (user.isStaff) navigate("/staff", { replace: true });
    else navigate("/customer", { replace: true });
  }, [user, navigate]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const data = await api<MeResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(data.user);
      const from = (location.state as { from?: string } | null)?.from;
      if (data.user.restrictedSession) navigate("/verify-email/pending");
      else if (data.user.isStaff) navigate("/staff");
      else navigate(from?.startsWith("/customer") ? from : "/customer");
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  const formError = error && !fieldError(error, "email") && !fieldError(error, "password");

  return (
    <AuthSplit
      title="Your loan, clearly in view."
      body={staff
        ? "Sign in to review applications, value security, and manage loans."
        : "Sign in to apply, or to see an application or loan already linked to your account."}
    >
      <DocumentHead title={staff ? "Staff sign-in" : "Log in"} path={staff ? "/staff/login" : "/login"} description="Sign in to the Toumu’a Lending school demonstration." />
      <h1>{staff ? "Staff sign-in" : "Welcome back"}</h1>
      {!staff ? <p className="hint" style={{ marginTop: 0 }}>Sign in to your account</p> : <p className="hint" style={{ marginTop: 0 }}>Use your office account</p>}
      <form onSubmit={(event) => void onSubmit(event)}>
        {formError ? (
          <p className="auth-error" role="alert">We couldn’t sign you in. Check your details and try again.</p>
        ) : null}
        <Field label="Email address" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(error, "email")} />
        <PasswordField label="Password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={fieldError(error, "password")} />
        <Button controlId="C02-01" className="btn-block" type="submit" disabled={pending}>{pending ? "Signing in…" : "Log in"}</Button>
      </form>
      <div className="auth-links">
        <Link to="/forgot-password" data-control-id="C02-02" state={{ email }}>Forgot password</Link>
        <Link to="/" data-control-id="C02-04">Back to home</Link>
      </div>
      {staff ? null : (
        <p>New here? <Link to="/register" data-control-id="C02-03">Create an account</Link></p>
      )}
      {staff ? null : (
        <p className="hint"><Link to="/staff/login" data-control-id="C02-04">Staff sign-in</Link></p>
      )}
    </AuthSplit>
  );
}

export function LoginPage() {
  return <LoginForm />;
}

export function StaffLoginPage() {
  return <LoginForm staff />;
}

export function RegisterPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const data = await api<MeResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });
      setUser(data.user);
      navigate("/verify-email/pending");
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthSplit
      title="Your next step starts here."
      body="Create an account to apply online, or to view a loan already linked for you."
    >
      <DocumentHead title="Create an account" path="/register" description="Register for a Toumu’a Lending demonstration account, then apply with collateral." />
      <h1>Create your account</h1>
      <p className="hint" style={{ marginTop: 0 }}>Register, then apply with the amount you need and the security you can offer.</p>
      <form onSubmit={(event) => void onSubmit(event)}>
        <Field label="Full name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={fieldError(error, "name")} />
        <Field label="Email address" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(error, "email")} />
        <PasswordField label="Password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} hint="Use 12 to 128 characters." error={fieldError(error, "password")} />
        <PasswordField label="Confirm password" name="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} error={fieldError(error, "confirmPassword")} />
        <Button controlId="A03-01" className="btn-block" type="submit" disabled={pending}>{pending ? "Creating…" : "Create account"}</Button>
      </form>
      <p>Already have an account? <Link to="/login" data-control-id="A03-02">Log in</Link></p>
      <p className="hint">We’ll send a link to verify your email.</p>
      <p className="hint">Creating an account does not submit a loan application. You apply after you sign in.</p>
      <p><Link to="/" data-control-id="A03-02">Back to home</Link></p>
    </AuthSplit>
  );
}

export function VerifyPendingPage() {
  const { user, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (!wait) return;
    const timer = window.setInterval(() => setWait((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [wait]);

  async function resend() {
    setError(null);
    try {
      const result = await api<{ retryAfterSeconds: number }>("/auth/email/resend", { method: "POST" });
      setMessage("Verification email sent.");
      setWait(result.retryAfterSeconds);
    } catch (err) {
      setError(err);
      setMessage("");
    }
  }

  async function saveEmail(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await api<{ email: string }>("/auth/email/change-pending", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(`Verification will go to ${result.email}`);
      setEditing(false);
      await refresh();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <main className="center-state">
      <div className="center-icon" aria-hidden>✉</div>
      <h1>Check your email</h1>
      <p>Open the verification link sent to your email address to continue.</p>
      {user?.email ? <p className="hint">{maskEmail(user.email)}</p> : null}
      <div className="info-bar">Your account is waiting for email verification.</div>
      <Button controlId="A04-01" type="button" variant="secondary" disabled={wait > 0} onClick={() => void resend()}>
        {wait > 0 ? `Resend in ${wait}s` : "Resend verification email"}
      </Button>
      <p>
        <button type="button" className="btn btn-ghost" data-control-id="A04-02" onClick={() => setEditing(true)}>
          Use a different email
        </button>
      </p>
      {editing ? (
        <form onSubmit={(event) => void saveEmail(event)}>
          <Field label="New email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(error, "email")} />
          <Button controlId="A04-02" type="submit">Save email</Button>
        </form>
      ) : null}
      {message ? <p>{message}</p> : null}
      {error ? <p className="field-error">{errorMessage(error, "Unable to send email")}</p> : null}
      <p className="hint">Check your spam folder if the message has not arrived.</p>
      <p className="hint">You can return to log in after verifying your email.</p>
    </main>
  );
}

export function VerifyEmailPage() {
  const { refresh, setUser } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<string>("loading");
  const [error, setError] = useState("");

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get("token");
    navigate("/verify-email", { replace: true });
    if (!token) {
      setResult("invalid");
      return;
    }
    void api<{ result: string }>("/auth/email/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(async (data) => {
        setResult(data.result);
        await refresh();
        setUser(null);
      })
      .catch((err) => {
        setResult("invalid");
        setError(errorMessage(err, "Verification failed"));
      });
  }, [navigate, params, refresh, setUser]);

  return (
    <main className="center-state">
      <div className="center-icon" aria-hidden>{result === "verified" || result === "already_verified" ? "✓" : "✉"}</div>
      <h1>{result === "verified" || result === "already_verified" ? "Email verified" : "Email verification"}</h1>
      {result === "loading" ? <p>Checking your link…</p> : null}
      {result === "verified" ? <p>Your email is verified. You can now log in to your account.</p> : null}
      {result === "already_verified" ? <p>This email is already verified.</p> : null}
      {result === "expired" || result === "invalid" || result === "already_used" ? (
        <p className="field-error">{error || "This verification link is not valid."}</p>
      ) : null}
      <p>
        <Link className="btn btn-primary" to="/login" data-control-id="A05-02">Continue to login</Link>
      </p>
      {result === "verified" || result === "already_verified" ? (
        <p className="hint">New to Toumu’a? Sign in and apply online, including the security you can offer. <Link to="/login" data-control-id="A05-04">Sign in</Link></p>
      ) : null}
      {result === "expired" || result === "invalid" || result === "already_used" ? (
        <p>
          <Link to="/verify-email/pending" data-control-id="A05-03">Request a new link</Link>
          {" · "}
          <Link to="/help" data-control-id="A05-04">Contact our team</Link>
        </p>
      ) : null}
    </main>
  );
}

export function ForgotPasswordPage() {
  const location = useLocation();
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const data = await api<{ message: string }>("/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(data.message || "If an account exists for this email, you’ll receive a reset link.");
    } catch (err) {
      setError(err);
      setMessage("");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <div className="two-col">
        <div>
          <h1 className="serif" style={{ fontSize: 40, marginBottom: 8 }}>Reset your password</h1>
          <p className="hint">Enter the email address linked to your account.</p>
          <form onSubmit={(event) => void onSubmit(event)}>
            <Field label="Email address" name="email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(error, "email")} />
            <Button controlId="A01-01" type="submit" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>
          </form>
          {message ? <p>{message}</p> : null}
          {error ? <p className="field-error">{errorMessage(error, "The email service did not accept this message")}</p> : null}
          <p><Link to="/login" data-control-id="A01-02">Back to login</Link></p>
          <p className="hint">Need help accessing your account? <Link to="/help">Contact our team</Link></p>
        </div>
        <aside className="return-strip" style={{ margin: 0, alignItems: "flex-start", flexDirection: "column" }}>
          <div className="center-icon" aria-hidden>⌘</div>
          <strong>Get back to your loan details.</strong>
        </aside>
      </div>
    </main>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const value = params.get("token") ?? "";
    setToken(value);
    navigate("/reset-password", { replace: true });
  }, [navigate, params]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api("/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      setDone(true);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <main className="page" style={{ maxWidth: 480 }}>
      <h1 className="serif" style={{ fontSize: 40 }}>Set a new password</h1>
      {done ? (
        <p>Password updated. You can log in with the new password.</p>
      ) : (
        <form onSubmit={(event) => void onSubmit(event)}>
          <PasswordField label="New password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} hint="Use 12 to 128 characters." error={fieldError(error, "password")} />
          <PasswordField label="Confirm new password" name="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} error={fieldError(error, "confirmPassword")} />
          {fieldError(error, "token") ? <p className="field-error">{fieldError(error, "token")}</p> : null}
          <Button controlId="A07-01" className="btn-block" type="submit">Reset password</Button>
        </form>
      )}
      <p>
        <Link to="/forgot-password" data-control-id="A07-02">Request a new link</Link>
        {" · "}
        <Link to="/login" data-control-id="A07-02">Back to login</Link>
      </p>
    </main>
  );
}

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [inspect, setInspect] = useState<{ valid: boolean; role?: string; reason?: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<unknown>(null);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const value = params.get("token") ?? "";
    setToken(value);
    navigate("/accept-invitation", { replace: true });
    if (value) {
      void api<{ valid: boolean; role?: string; reason?: string }>(`/auth/invitations/inspect?token=${encodeURIComponent(value)}`)
        .then(setInspect);
    }
  }, [navigate, params]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api("/auth/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token, password, confirmPassword, role: "MANAGER" }),
      });
      navigate("/staff/login");
    } catch (err) {
      setError(err);
    }
  }

  return (
    <AuthSplit
      title="Activate your staff account."
      body="Set a password to join the lending workspace. Your role is assigned by the office."
    >
      <h1>Activate staff account</h1>
      {inspect && !inspect.valid ? (
        <p className="field-error">This invitation is {inspect.reason ?? "not active"}.</p>
      ) : (
        <>
          <p className="hint">Your role will be assigned by the office{inspect?.role ? `: ${inspect.role}` : ""}.</p>
          <form onSubmit={(event) => void onSubmit(event)}>
            <PasswordField label="Password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} hint="Use 12 to 128 characters." error={fieldError(error, "password")} />
            <PasswordField label="Confirm password" name="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} error={fieldError(error, "confirmPassword")} />
            <Button controlId="A06-01" className="btn-block" type="submit">Activate account</Button>
          </form>
        </>
      )}
      <p>
        <Link to="/staff/login" data-control-id="A06-02">Back to staff login</Link>
        {" · "}
        <Link to="/help" data-control-id="A06-02">Request a new invitation</Link>
      </p>
    </AuthSplit>
  );
}

export function AccountPage() {
  const { user, clearProtectedCache } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await api("/auth/logout", { method: "POST" });
    clearProtectedCache();
    navigate(user?.isStaff ? "/staff/login" : "/login");
  }
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/auth/password/change", {
        method: "POST",
        body: JSON.stringify({ currentPassword, password, confirmPassword }),
      });
      clearProtectedCache();
      navigate(user?.isStaff ? "/staff/login" : "/login");
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={user?.isStaff ? "staff-page" : "page"}>
      <p className="kicker">Account</p>
      <h1 className="serif" style={{ fontSize: 40, marginTop: 0 }}>Your account</h1>
      <div className="two-col">
        <section>
          <h2>Personal details</h2>
          <dl className="detail-list">
            <dt>Name</dt>
            <dd>{user?.name}</dd>
            <dt>Email</dt>
            <dd>{user?.email}</dd>
            <dt>Role</dt>
            <dd>{user?.role ?? "Customer"}</dd>
          </dl>
          <p className="hint">To update your loan record, contact our team.</p>
          <Link className="btn btn-secondary" to="/help" data-control-id="A02-02">Contact our team</Link>
        </section>
        <section>
          <h2>Password</h2>
          <form onSubmit={(event) => void onSubmit(event)}>
            <PasswordField label="Current password" name="currentPassword" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" error={fieldError(error, "currentPassword")} />
            <PasswordField label="New password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} hint="Use 12 to 128 characters." error={fieldError(error, "password")} />
            <PasswordField label="Confirm new password" name="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} error={fieldError(error, "confirmPassword")} />
            <Button controlId="A02-01" type="submit" disabled={pending}>Update password</Button>
          </form>
        </section>
      </div>
      <p style={{ marginTop: 40, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link to={user?.isStaff ? "/staff" : "/customer"} data-control-id="A02-02">Back to overview</Link>
        <button type="button" className="btn btn-secondary" data-control-id="A02-03" onClick={() => void signOut()}>
          Sign out
        </button>
      </p>
    </main>
  );
}
