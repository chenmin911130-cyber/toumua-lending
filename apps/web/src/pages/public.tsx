import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Field, PasswordField } from "@toumua/ui";
import { api, errorMessage, fieldError, type ContactResponse, type MeResponse } from "../api";
import { useAuth } from "../auth";
import { maskEmail } from "../format";

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
        <Link to="/" className="logo" data-control-id="GLOBAL-01">Toumu’a</Link>
        <div>
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
        <p style={{ color: "#d7e2ea", fontSize: 14 }}>Toumu’a Money Transfer Ltd</p>
      </aside>
      <section className="auth-form">
        <div className="auth-form-inner">{children}</div>
      </section>
    </div>
  );
}

export function HomePage() {
  return (
    <main>
      <section className="hero">
        <div>
          <p className="kicker">Secured lending</p>
          <h1 className="display">A little support. For what matters.</h1>
          <p className="lead">
            Toumu’a records secured loans for personal, family and community needs. Applications are completed with a loan officer in the office — not online.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/help" data-control-id="C01-03">Contact our team</Link>
            <a className="btn btn-secondary" href="/#how-it-works" data-control-id="C01-01">How it works</a>
          </div>
        </div>
        <img
          className="hero-photo"
          src="/images/hero-meeting.jpg"
          alt="A loan officer meeting with customers"
        />
      </section>

      <div className="return-strip">
        <div>
          <strong>Already have a loan?</strong>
          <div className="hint">Sign in to view the loan linked to your account.</div>
        </div>
        <Link className="btn btn-secondary" to="/login" data-control-id="C01-02">View my loan</Link>
      </div>

      <section id="how-it-works" tabIndex={-1} className="page" style={{ paddingTop: 0 }}>
        <p className="kicker">How it works</p>
        <h2 className="serif" style={{ fontSize: 36, color: "var(--navy)", marginTop: 0 }}>Three steps with our office team</h2>
      </section>
      <div className="steps">
        <article>
          <div className="step-num">01</div>
          <h3>Meet our team</h3>
          <p className="hint">Speak with a loan officer and complete the application together.</p>
        </article>
        <article>
          <div className="step-num">02</div>
          <h3>Assessment and review</h3>
          <p className="hint">Security is valued and a manager reviews the application before any funds are released.</p>
        </article>
        <article>
          <div className="step-num">03</div>
          <h3>Receive your loan</h3>
          <p className="hint">After approval and inspection, security is stored and the cashier records the disbursement.</p>
        </article>
      </div>

      <footer className="page-footer">
        <span>Repayments are made with our cashier.</span>
        <Link to="/help">Contact</Link>
      </footer>
    </main>
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
      body="Sign in to see the application or loan our team has linked to your account."
    >
      <h1>{staff ? "Staff sign-in" : "Welcome back"}</h1>
      {!staff ? <p className="hint" style={{ marginTop: 0 }}>Sign in to your account</p> : <p className="hint" style={{ marginTop: 0 }}>Use your office account</p>}
      <form onSubmit={(event) => void onSubmit(event)}>
        {formError ? (
          <p className="auth-error">We couldn’t sign you in. Check your details and try again.</p>
        ) : null}
        <Field label="Email address" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(error, "email")} />
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

const FAQS = [
  {
    q: "How do I apply?",
    a: "Meet with a loan officer to complete your application together. Your security assets will be valued before manager review.",
  },
  {
    q: "Where do I make repayments?",
    a: "Repayments are recorded by our cashier in the office. This website does not take online payments.",
  },
  {
    q: "When is my security returned?",
    a: "Security is returned after the loan balance is cleared, or recorded as sold if a default sale is completed.",
  },
  {
    q: "How can I check my application?",
    a: "Sign in to view application progress once a staff member has linked your account.",
  },
];

export function HelpPage() {
  const [contact, setContact] = useState<ContactResponse | null>(null);
  useEffect(() => {
    void api<ContactResponse>("/public/contact").then(setContact);
  }, []);
  return (
    <main className="page">
      <h1 className="display" style={{ fontSize: 48 }}>We’re here to help.</h1>
      <p className="lead">Speak with your loan officer about your application, repayments or security assets.</p>
      <div className="two-col">
        <section>
          <h2>Common questions</h2>
          <div className="faq">
            {FAQS.map((item, index) => (
              <details key={item.q} open={index === 0}>
                <summary>{item.q}</summary>
                <p className="hint">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
        <aside>
          <h2>Your loan officer</h2>
          {contact?.phone || contact?.email || contact?.address ? (
            <ul>
              {contact.phone ? <li>{contact.phone}</li> : null}
              {contact.email ? <li>{contact.email}</li> : null}
              {contact.address ? <li>{contact.address}</li> : null}
              {contact.hours ? <li>{contact.hours}</li> : null}
            </ul>
          ) : (
            <p className="hint">{contact?.note ?? "Please use the contact details provided with your loan agreement."}</p>
          )}
          <p><Link to="/login" data-control-id="C01-02">View my application</Link></p>
          <div className="return-strip" style={{ margin: "24px 0 0" }}>
            <div>
              <strong>Need to update your details?</strong>
              <div className="hint">Contact our team to update the information on your loan record.</div>
            </div>
          </div>
        </aside>
      </div>
      <section style={{ marginTop: 48 }}>
        <h2>How it works</h2>
        <div className="steps steps-4" style={{ padding: 0 }}>
          <article><div className="step-num">01</div><h3>Apply with an officer</h3></article>
          <article><div className="step-num">02</div><h3>Valuation</h3></article>
          <article><div className="step-num">03</div><h3>Manager decision</h3></article>
          <article><div className="step-num">04</div><h3>Security intake, then disbursement</h3></article>
        </div>
      </section>
    </main>
  );
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
      body="Create an account to view an application or loan our team links for you."
    >
      <h1>Create your account</h1>
      <p className="hint" style={{ marginTop: 0 }}>Register to view your application and loan details.</p>
      <form onSubmit={(event) => void onSubmit(event)}>
        <Field label="Full name" name="name" value={name} onChange={(e) => setName(e.target.value)} error={fieldError(error, "name")} />
        <Field label="Email address" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(error, "email")} />
        <PasswordField label="Password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" error={fieldError(error, "password")} />
        <PasswordField label="Confirm password" name="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" error={fieldError(error, "confirmPassword")} />
        <Button controlId="A03-01" className="btn-block" type="submit" disabled={pending}>{pending ? "Creating…" : "Create account"}</Button>
      </form>
      <p>Already have an account? <Link to="/login" data-control-id="A03-02">Log in</Link></p>
      <p className="hint">We’ll send a link to verify your email.</p>
      <p className="hint">Creating an account does not submit a loan application.</p>
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
        <p className="hint">New to Toumu’a? Contact our team to start a loan application with a loan officer. <Link to="/help" data-control-id="A05-04">Contact our team</Link></p>
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
          <PasswordField label="New password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" error={fieldError(error, "password")} />
          <PasswordField label="Confirm new password" name="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" error={fieldError(error, "confirmPassword")} />
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
            <PasswordField label="Password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" error={fieldError(error, "password")} />
            <PasswordField label="Confirm password" name="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" error={fieldError(error, "confirmPassword")} />
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
            <PasswordField label="New password" name="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" error={fieldError(error, "password")} />
            <PasswordField label="Confirm new password" name="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" error={fieldError(error, "confirmPassword")} />
            <Button controlId="A02-01" type="submit" disabled={pending}>Update password</Button>
          </form>
        </section>
      </div>
      <p style={{ marginTop: 40 }}>
        <Link to={user?.isStaff ? "/staff" : "/customer"} data-control-id="A02-02">Back to overview</Link>
      </p>
    </main>
  );
}
