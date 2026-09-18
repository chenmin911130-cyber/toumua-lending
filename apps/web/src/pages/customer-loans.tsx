import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { CustomerLoanDetail, LoanSummary } from "@toumua/contracts";
import { api, errorMessage } from "../api";
import { formatDate, formatDateTime, statusLabel } from "../format";

type ListResponse = { items: LoanSummary[]; total: number };

function LoanNav({ loanId, active }: { loanId: string; active: "detail" | "repayments" | "security" }) {
  const base = `/customer/loans/${loanId}`;
  return (
    <nav className="nav-links" style={{ marginBottom: 24 }}>
      <Link to={base} className={active === "detail" ? "active" : undefined} data-control-id="C03-01">
        Overview
      </Link>
      <Link to={`${base}/repayments`} className={active === "repayments" ? "active" : undefined} data-control-id="C05-01">
        Repayments
      </Link>
      <Link to={`${base}/security`} className={active === "security" ? "active" : undefined} data-control-id="C06-01">
        Security
      </Link>
    </nav>
  );
}

function useCustomerLoan(loanId: string) {
  const [loan, setLoan] = useState<CustomerLoanDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    void api<CustomerLoanDetail>(`/me/loans/${loanId}`)
      .then(setLoan)
      .catch(setError);
  }, [loanId]);
  return { loan, error };
}

export function CustomerLoanDetailPage() {
  const { loanId = "" } = useParams();
  const { loan, error } = useCustomerLoan(loanId);
  if (error) {
    return (
      <main className="page">
        <p className="error">{errorMessage(error, "Could not load loan")}</p>
        <Link to="/customer/loans">← My loans</Link>
      </main>
    );
  }
  if (!loan) return <main className="page"><p>Loading loan…</p></main>;

  return (
    <main className="page">
      <Link to="/customer/loans">← My loans</Link>
      <h1 className="serif" style={{ fontSize: 40, marginTop: 16 }}>{loan.number}</h1>
      <p className="hint">
        {statusLabel(loan.status)}
        {loan.applicationNumber ? ` · Application ${loan.applicationNumber}` : ""}
      </p>
      <LoanNav loanId={loanId} active="detail" />
      <section className="metrics" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <article>
          <div className="metric-label">Outstanding balance</div>
          <div className="metric-value">${loan.balance}</div>
        </article>
        <article>
          <div className="metric-label">Original principal</div>
          <div className="metric-value">${loan.principal}</div>
        </article>
        <article>
          <div className="metric-label">Next payment</div>
          <div className="metric-value" style={{ fontSize: 22 }}>
            {loan.nextDueDate ? formatDate(loan.nextDueDate) : "—"}
          </div>
        </article>
      </section>
      {loan.overdueAmount !== "0.00" ? (
        <p className="error">Overdue amount: ${loan.overdueAmount}</p>
      ) : null}
      {loan.defaultReason ? <p className="hint">Default note: {loan.defaultReason}</p> : null}
      <div className="hero-actions" style={{ marginTop: 24 }}>
        <Link className="btn btn-primary" to={`/customer/loans/${loanId}/repayments`} data-control-id="C03-02">
          View repayment schedule
        </Link>
        <Link className="btn btn-secondary" to={`/customer/loans/${loanId}/security`} data-control-id="C03-03">
          View security items
        </Link>
        <Link className="btn btn-secondary" to="/help" data-control-id="C03-04">
          Contact our team
        </Link>
      </div>
      <section style={{ marginTop: 40 }}>
        <h2>Loan details</h2>
        <dl className="detail-list">
          <dt>Repayment frequency</dt>
          <dd>{statusLabel(loan.frequency)}</dd>
          <dt>Number of payments</dt>
          <dd>{loan.periods}</dd>
          <dt>First payment date</dt>
          <dd>{formatDate(loan.firstPaymentDate)}</dd>
          <dt>Disbursed</dt>
          <dd>{loan.disbursedAt ? formatDateTime(loan.disbursedAt) : "Not yet disbursed"}</dd>
          {loan.settledAt ? (
            <>
              <dt>Settled</dt>
              <dd>{formatDateTime(loan.settledAt)}</dd>
            </>
          ) : null}
        </dl>
      </section>
    </main>
  );
}

export function CustomerRepaymentsPage() {
  const { loanId = "" } = useParams();
  const [search] = useSearchParams();
  const tab = search.get("tab") === "history" ? "history" : "schedule";
  const { loan, error } = useCustomerLoan(loanId);

  if (error) {
    return (
      <main className="page">
        <p className="error">{errorMessage(error, "Could not load repayments")}</p>
        <Link to="/customer/loans">← My loans</Link>
      </main>
    );
  }
  if (!loan) return <main className="page"><p>Loading repayments…</p></main>;

  return (
    <main className="page">
      <Link to={`/customer/loans/${loanId}`}>← {loan.number}</Link>
      <h1 className="serif" style={{ fontSize: 40, marginTop: 16 }}>Repayments</h1>
      <LoanNav loanId={loanId} active="repayments" />
      <div className="hero-actions" style={{ marginBottom: 24 }}>
        <Link
          className={tab === "schedule" ? "btn btn-primary" : "btn btn-secondary"}
          to={`/customer/loans/${loanId}/repayments?tab=schedule`}
          data-control-id="C05-02"
        >
          Schedule
        </Link>
        <Link
          className={tab === "history" ? "btn btn-primary" : "btn btn-secondary"}
          to={`/customer/loans/${loanId}/repayments?tab=history`}
          data-control-id="C05-03"
        >
          Receipt history
        </Link>
      </div>
      {tab === "schedule" ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Due date</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loan.schedule.length ? loan.schedule.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.number}</td>
                <td>{formatDate(entry.dueDate)}</td>
                <td>${entry.amount}</td>
                <td>${entry.paidAmount}</td>
                <td>
                  {entry.overdue ? "Overdue" : statusLabel(entry.status)}
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="empty-row">No schedule is available for this loan yet.</td></tr>
            )}
          </tbody>
        </table>
      ) : (
        <section className="stack" style={{ maxWidth: 720 }}>
          {loan.receipts.length ? loan.receipts.map((receipt) => (
            <Link key={receipt.id} to={`/customer/receipts/${receipt.id}`} className="card" data-control-id="C05-04">
              <strong>{receipt.number}</strong>
              <span>
                {statusLabel(receipt.type)} · ${receipt.amount} · {formatDate(receipt.businessDate)}
              </span>
            </Link>
          )) : (
            <p className="hint">No receipts have been issued for this loan yet.</p>
          )}
        </section>
      )}
    </main>
  );
}

export function CustomerSecurityPage() {
  const { loanId = "", assetId } = useParams();
  const { loan, error } = useCustomerLoan(loanId);

  if (error) {
    return (
      <main className="page">
        <p className="error">{errorMessage(error, "Could not load security items")}</p>
        <Link to="/customer/loans">← My loans</Link>
      </main>
    );
  }
  if (!loan) return <main className="page"><p>Loading security…</p></main>;

  const selected = assetId ? loan.assets.find((asset) => asset.id === assetId) : null;
  if (assetId && !selected) {
    return (
      <main className="page">
        <p className="error">Security item not found.</p>
        <Link to={`/customer/loans/${loanId}/security`}>← All security items</Link>
      </main>
    );
  }

  return (
    <main className="page">
      <Link to={selected ? `/customer/loans/${loanId}/security` : `/customer/loans/${loanId}`}>
        ← {selected ? "All security items" : loan.number}
      </Link>
      <h1 className="serif" style={{ fontSize: 40, marginTop: 16 }}>
        {selected ? selected.name : "My security"}
      </h1>
      <LoanNav loanId={loanId} active="security" />
      {selected ? (
        <section className="card stack" style={{ maxWidth: 720 }}>
          <p>{selected.description}</p>
          <dl className="detail-list">
            <dt>Condition</dt>
            <dd>{selected.condition}</dd>
            <dt>Status</dt>
            <dd>{statusLabel(selected.status)}</dd>
            {selected.category ? (
              <>
                <dt>Category</dt>
                <dd>{selected.category}</dd>
              </>
            ) : null}
            {selected.identifier ? (
              <>
                <dt>Identifier</dt>
                <dd>{selected.identifier}</dd>
              </>
            ) : null}
            <dt>Valuation</dt>
            <dd>
              {selected.valuationAmount
                ? `$${selected.valuationAmount}${selected.valuationStatus ? ` (${statusLabel(selected.valuationStatus)})` : ""}`
                : "Not yet valued"}
            </dd>
            <dt>Photos on file</dt>
            <dd>{selected.photoCount}</dd>
          </dl>
          {selected.photoIds.length ? (
            <div className="photo-grid">
              {selected.photoIds.map((photoId) => (
                <img
                  key={photoId}
                  src={`/api/v1/photos/${photoId}/file`}
                  alt={`${selected.name} photo`}
                />
              ))}
            </div>
          ) : (
            <p className="hint">No photos have been uploaded for this item yet.</p>
          )}
          <p className="hint">Storage location and custody notes are managed by the office and are not shown here.</p>
        </section>
      ) : (
        <section className="stack" style={{ maxWidth: 720 }}>
          {loan.assets.length ? loan.assets.map((asset) => (
            <Link
              key={asset.id}
              to={`/customer/loans/${loanId}/security/${asset.id}`}
              className="card"
              data-control-id="C06-02"
            >
              <strong>{asset.name}</strong>
              <span>
                {statusLabel(asset.status)}
                {asset.valuationAmount ? ` · valued at $${asset.valuationAmount}` : ""}
              </span>
            </Link>
          )) : (
            <p className="hint">No security items are linked to this loan.</p>
          )}
        </section>
      )}
    </main>
  );
}

export function CustomerReceiptPage() {
  const { id = "" } = useParams();
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void api<Record<string, unknown>>(`/me/receipts/${id}`)
      .then(setReceipt)
      .catch(setError);
  }, [id]);

  if (error) {
    return (
      <main className="page">
        <p className="error">{errorMessage(error, "Could not load receipt")}</p>
        <Link to="/customer/loans">← My loans</Link>
      </main>
    );
  }
  if (!receipt) return <main className="page"><p>Loading receipt…</p></main>;

  const summary = (receipt.summary ?? {}) as Record<string, unknown>;
  const loanId = String(receipt.loanId ?? "");

  return (
    <main className="page">
      <Link to={loanId ? `/customer/loans/${loanId}/repayments?tab=history` : "/customer/loans"}>
        ← Back to receipts
      </Link>
      <h1 className="serif" style={{ fontSize: 40, marginTop: 16 }}>{String(receipt.number)}</h1>
      <p className="hint">Loan {String(receipt.loanNumber ?? "")} · {formatDateTime(String(receipt.createdAt ?? ""))}</p>
      <section className="card stack" style={{ maxWidth: 720, marginTop: 24 }}>
        <dl className="detail-list">
          <dt>Type</dt>
          <dd>{statusLabel(String(summary.type ?? "RECEIPT"))}</dd>
          <dt>Amount</dt>
          <dd>${String(summary.amount ?? "0.00")}</dd>
          <dt>Business date</dt>
          <dd>{formatDate(String(summary.businessDate ?? ""))}</dd>
          {summary.balanceAfter ? (
            <>
              <dt>Balance after</dt>
              <dd>${String(summary.balanceAfter)}</dd>
            </>
          ) : null}
          {summary.method ? (
            <>
              <dt>Method</dt>
              <dd>{statusLabel(String(summary.method))}</dd>
            </>
          ) : null}
        </dl>
        <p className="hint">This is your customer copy. Contact the office if anything looks incorrect.</p>
        <div className="hero-actions">
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            Print receipt
          </button>
          <Link className="btn btn-secondary" to="/help" data-control-id="C05-05">Contact our team</Link>
        </div>
      </section>
    </main>
  );
}

export function CustomerLoansListPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void api<ListResponse>("/me/loans").then(setData).catch(setError);
  }, []);

  if (error) {
    return (
      <main className="page">
        <p className="error">{errorMessage(error, "Could not load loans")}</p>
      </main>
    );
  }
  if (!data) return <main className="page"><p>Loading loans…</p></main>;

  return (
    <main className="page">
      <h1 className="serif" style={{ fontSize: 40 }}>My loans</h1>
      <p>{data.total} loan{data.total === 1 ? "" : "s"} linked to this account.</p>
      <section className="stack" style={{ maxWidth: 720, marginTop: 32 }}>
        {data.items.map((loan) => (
          <article key={loan.id} className="card stack">
            <div>
              <strong>{loan.number}</strong>
              <span>{statusLabel(loan.status)} · balance ${loan.balance}</span>
            </div>
            <div className="hero-actions">
              <Link className="btn btn-primary" to={`/customer/loans/${loan.id}`} data-control-id="C09-01">
                Open loan
              </Link>
              <Link className="btn btn-secondary" to={`/customer/loans/${loan.id}/repayments`}>
                Repayments
              </Link>
              <Link className="btn btn-secondary" to={`/customer/loans/${loan.id}/security`}>
                Security
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
