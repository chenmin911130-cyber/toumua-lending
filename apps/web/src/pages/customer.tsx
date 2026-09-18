import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LoanSummary } from "@toumua/contracts";
import { api } from "../api";
import { useAuth } from "../auth";
import { firstName, formatDate, statusLabel } from "../format";

type ListResponse = { items: LoanSummary[]; total: number };

export function CustomerHomePage() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<ListResponse | null>(null);
  const [applications, setApplications] = useState<ListResponse | null>(null);

  useEffect(() => {
    void Promise.all([
      api<ListResponse>("/me/loans"),
      api<ListResponse>("/me/applications"),
    ]).then(([loanData, appData]) => {
      setLoans(loanData);
      setApplications(appData);
    });
  }, []);

  if (!loans || !applications) {
    return <main className="page"><p>Loading your account…</p></main>;
  }

  if (loans.total === 0) {
    return (
      <main className="page">
        <h1 className="serif" style={{ fontSize: 40, marginBottom: 8 }}>Welcome, {firstName(user?.name ?? "there")}.</h1>
        <p className="hint" style={{ marginTop: 0 }}>Your account is ready.</p>
        <section className="center-state" style={{ marginTop: 48 }}>
          <div className="center-icon" aria-hidden>☰</div>
          <h2 className="serif" style={{ fontSize: 32, color: "var(--navy)" }}>No loan is linked to your account yet.</h2>
          <p className="empty-copy">
            If you already have a loan, contact our team to link your existing record. To apply for a loan, meet with a loan officer.
          </p>
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <Link className="btn btn-primary" to="/help" data-control-id="C10-01">Contact our team</Link>
            <Link className="btn btn-secondary" to="/customer/applications" data-control-id="C10-02">View application progress</Link>
          </div>
          <div className="guide" style={{ marginTop: 36 }}>
            <span>Complete your account</span>
            <span>Speak with our team</span>
            <span>View your loan here</span>
          </div>
        </section>
      </main>
    );
  }

  const items = loans.items;
  return (
    <main className="page">
      <h1 className="serif" style={{ fontSize: 40, marginBottom: 8 }}>Welcome back, {firstName(user?.name ?? "there")}.</h1>
      <p className="hint" style={{ marginTop: 0 }}>
        {loans.total} loan{loans.total === 1 ? "" : "s"} linked to this account.
      </p>
      <section className="stack" style={{ maxWidth: 720, marginTop: 32 }}>
        {items.map((loan) => (
          <article key={loan.id} className="card stack">
            <div>
              <strong>{loan.number}</strong>
              <span>
                {statusLabel(loan.status)} · balance ${loan.balance}
                {loan.nextDueDate ? ` · next due ${formatDate(loan.nextDueDate)}` : ""}
              </span>
            </div>
            <div className="hero-actions">
              <Link className="btn btn-primary" to={`/customer/loans/${loan.id}`} data-control-id="C03-01">
                Open loan
              </Link>
              <Link className="btn btn-secondary" to={`/customer/loans/${loan.id}/repayments`} data-control-id="C05-01">
                Repayments
              </Link>
            </div>
          </article>
        ))}
      </section>
      <p style={{ marginTop: 24 }}>
        <Link to="/customer/loans" data-control-id="C09-01">View all loans</Link>
        {" · "}
        <Link to="/customer/applications">Application progress</Link>
      </p>
    </main>
  );
}

type CustomerApplication = {
  id: string;
  number: string;
  status: string;
  borrowerName: string | null;
  updatedAt: string;
};

export function CustomerApplicationsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  useEffect(() => {
    void api<ListResponse>("/me/applications").then(setData);
  }, []);
  const items = (data?.items ?? []) as CustomerApplication[];
  return (
    <main className="page">
      <h1 className="serif" style={{ fontSize: 40 }}>Application</h1>
      <div className="center-state" style={{ marginTop: 48 }}>
        {!data ? (
          <p>Loading…</p>
        ) : data.total === 0 ? (
          <>
            <div className="center-icon" aria-hidden>☰</div>
            <h2>No application yet</h2>
            <p className="empty-copy">Applications are completed with a loan officer in the office. Nothing is visible on this account yet.</p>
            <Link className="btn btn-primary" to="/help" data-control-id="C04-02">Contact our team</Link>
          </>
        ) : (
          <section className="stack" style={{ width: "100%", maxWidth: 720 }}>
            {items.map((item) => (
              <Link key={item.id} to={`/customer/applications/${item.id}`} className="card" data-control-id="C04-01">
                <strong>{item.number}</strong>
                <span>{item.borrowerName ?? "Borrower"} · {item.status.toLowerCase()}</span>
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

