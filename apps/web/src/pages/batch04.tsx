import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Field } from "@toumua/ui";
import type { AssetHistoryEntry, CursorListResponse, LoanDetail, LoanSummary } from "@toumua/contracts";
import { api, errorMessage, fieldError, postIdempotent } from "../api";
import { aucklandBusinessDate } from "../format";
import { ResourceGate, useAsyncResource } from "../load-state";
import { useAuth } from "../auth";
import { StorageLocationField } from "./storage";

type AssetView = {
  id: string;
  name: string;
  loanNumber: string | null;
  status: string;
  version: number;
  storageLocation: {
    id: string;
    code: string;
    name: string;
    kind: string;
    secure: boolean;
  } | null;
  storageLocationLabel: string | null;
  borrower: { id: string; number: string; name: string } | null;
  valuationStatus: string | null;
  custody: Array<{
    id: string;
    type: string;
    businessDate: string;
    location: string | null;
    recordedBy: string | null;
  }>;
  allowedActions: Array<{ id: string; allowed: boolean; reason?: string }>;
  saleDraft?: Record<string, unknown> | null;
};

type Readiness = {
  ready: boolean;
  items: Array<{ id: string; label: string; complete: boolean; detail?: string }>;
};

type Review = {
  version: number;
  canApprove: boolean;
  canDecline: boolean;
  checks: Array<{ id: string; label: string; complete: boolean }>;
  number?: string;
  borrowerName?: string | null;
  requestedAmount?: string | null;
  valuationTotal?: string;
  purpose?: string | null;
  proposedTermMonths?: number | null;
  managerReasons?: string[];
  assets?: Array<{
    id: string;
    name: string;
    description: string;
    photoCount: number;
    valuationStatus: string | null;
    valuationAmount?: string | null;
  }>;
};

function placeLabel(asset: Pick<AssetView, "storageLocation" | "storageLocationLabel">) {
  if (asset.storageLocation) return `${asset.storageLocation.code} · ${asset.storageLocation.name}`;
  return asset.storageLocationLabel ?? "—";
}

function borrowerLabel(borrower: AssetView["borrower"]) {
  if (!borrower) return "—";
  return `${borrower.name} (${borrower.number})`;
}

/** Action flags come from the server so the UI cannot offer a refused action. */
function actionFor(loan: LoanDetail, id: string) {
  return loan.allowedActions.find((action) => action.id === id);
}

export function StaffLoansPage() {
  const [data, setData] = useState<CursorListResponse<LoanSummary> | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    void api<CursorListResponse<LoanSummary>>("/loans").then(setData).catch(setError);
  }, []);
  return (
    <main className="staff-page">
      <h1>Loans</h1>
      {error ? <p className="error">{errorMessage(error, "Could not load loans")}</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Loan</th>
            <th>Borrower</th>
            <th>Status</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.length ? data.items.map((row) => (
            <tr key={row.id}>
              <td><Link to={`/staff/loans/${row.id}`}>{row.number}</Link></td>
              <td>{row.borrowerName}</td>
              <td>{row.status.replaceAll("_", " ")}</td>
              <td>{row.balance}</td>
            </tr>
          )) : (
            <tr><td colSpan={4} className="empty-row">No loans yet.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

export function StaffLoanDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [issueReason, setIssueReason] = useState("");
  const [issueError, setIssueError] = useState<unknown>(null);
  useEffect(() => {
    void api<LoanDetail>(`/loans/${id}`).then(setLoan).catch(setError);
  }, [id]);
  if (error) return <main className="staff-page"><p className="error">{errorMessage(error, "Could not load loan")}</p></main>;
  if (!loan) return <main className="staff-page"><p>Loading loan…</p></main>;
  const disburse = actionFor(loan, "disburse");
  const repay = actionFor(loan, "repay");
  const declareDefault = actionFor(loan, "default");
  const saleReceipt = actionFor(loan, "sale-receipt");
  return (
    <main className="staff-page">
      <Link to="/staff/loans">← Loans</Link>
      <h1>{loan.number}</h1>
      <p className="hint">{loan.borrowerName} · {loan.status.replaceAll("_", " ")} · balance {loan.balance}</p>
      {loan.defaultReason ? <p className="hint">Default: {loan.defaultReason}</p> : null}
      {loan.overdueAmount !== "0.00" ? <p className="error">Overdue {loan.overdueAmount}</p> : null}
      <div className="hero-actions">
        {disburse?.allowed ? (
          <Link className="btn btn-primary" to={`/staff/loans/${id}/disbursement`}>Disbursement</Link>
        ) : (
          <p className="hint">Disbursement unavailable: {disburse?.reason ?? "not permitted"}</p>
        )}
        {repay?.allowed ? (
          <Link className="btn btn-secondary" to={`/staff/loans/${id}/repayment`}>Repayment</Link>
        ) : (
          <p className="hint">Repayment unavailable: {repay?.reason ?? "not permitted"}</p>
        )}
        {declareDefault?.allowed ? (
          <Link className="btn btn-secondary" to={`/staff/loans/${id}/default`}>Declare default</Link>
        ) : null}
        {saleReceipt?.allowed ? (
          <Link className="btn btn-secondary" to={`/staff/loans/${id}/sale-receipt`}>Sale proceeds</Link>
        ) : null}
      </div>
      {loan.contract ? (
        <p className="hint">
          Contract {loan.contract.number} v{loan.contract.version} · {loan.contract.status}
          {loan.contract.signerMethod ? ` · ${loan.contract.signerMethod}` : ""}
          {loan.contract.signedAt ? ` · ${loan.contract.signedAt.slice(0, 16).replace("T", " ")}` : ""}
          {" · "}
          <Link to={`/staff/contracts/${loan.contract.id}`}>View contract</Link>
        </p>
      ) : loan.status === "APPROVED_UNFUNDED" && user?.role === "MANAGER" ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            setIssueError(null);
            void api<{ id: string }>(`/loans/${id}/contract/reissue`, {
              method: "POST",
              body: JSON.stringify({ reason: issueReason }),
            })
              .then((created) => {
                window.location.assign(`/staff/contracts/${created.id}`);
              })
              .catch(setIssueError);
          }}
        >
          <h2>Issue contract</h2>
          <p className="hint">This loan was approved before a contract existed. Issue version 1 so it can be signed and disbursed.</p>
          <Field label="Reason">
            <input value={issueReason} onChange={(event) => setIssueReason(event.target.value)} required />
          </Field>
          {issueError ? <p className="error">{errorMessage(issueError, "Could not issue the contract")}</p> : null}
          <Button type="submit">Issue contract</Button>
        </form>
      ) : loan.status === "APPROVED_UNFUNDED" ? (
        <p className="hint">A manager needs to issue the loan contract before it can be signed.</p>
      ) : null}
      <table className="data-table">
        <thead><tr><th>#</th><th>Due</th><th>Amount</th><th>Paid</th><th>Status</th></tr></thead>
        <tbody>
          {loan.schedule.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.number}</td>
              <td>{entry.dueDate.slice(0, 10)}</td>
              <td>{entry.amount}</td>
              <td>{entry.paidAmount}</td>
              <td>{entry.overdue ? "OVERDUE" : entry.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

export function StaffDisbursementPage() {
  const { id = "" } = useParams();
  const [method, setMethod] = useState("CASH");
  const [businessDate, setBusinessDate] = useState(() => aucklandBusinessDate());
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [result, setResult] = useState<string | null>(null);
  const resource = useAsyncResource(id, async (loanId, signal) => {
    const [loanData, readinessData] = await Promise.all([
      api<LoanDetail>(`/loans/${loanId}`, { signal }),
      api<Readiness>(`/loans/${loanId}/disbursement-readiness`, { signal }),
    ]);
    return { loan: loanData, readiness: readinessData };
  });
  const loan = resource.data?.loan ?? null;
  const readiness = resource.data?.readiness ?? null;
  // One key per payment intent: a retry after a lost response must replay the
  // original attempt instead of posting a second disbursement.
  const idempotencyKey = useRef(`web-disburse-${id}-${crypto.randomUUID()}`);

  useEffect(() => {
    idempotencyKey.current = `web-disburse-${id}-${crypto.randomUUID()}`;
    setSubmitError(null);
    setResult(null);
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!loan || !readiness) return;
    setSubmitError(null);
    try {
      const response = await postIdempotent<{ receiptNumber: string }>(
        `/loans/${id}/disbursements`,
        {
          expectedVersion: loan.version,
          businessDate,
          method,
        },
        idempotencyKey.current,
      );
      setResult(response.receiptNumber);
      // Refresh so the page reflects the new status and version.
      const [refreshedLoan, refreshedReadiness] = await Promise.all([
        api<LoanDetail>(`/loans/${id}`),
        api<Readiness>(`/loans/${id}/disbursement-readiness`),
      ]);
      resource.setData({ loan: refreshedLoan, readiness: refreshedReadiness });
    } catch (err) {
      setSubmitError(err);
    }
  }

  if (!loan || !readiness) {
    return (
      <main className="staff-page">
        <ResourceGate
          loading={resource.loading}
          error={resource.error}
          ready={false}
          onRetry={resource.retry}
          loadingLabel="Loading…"
          errorFallback="Could not load loan"
        />
      </main>
    );
  }
  return (
    <main className="staff-page">
      <Link to={`/staff/loans/${id}`}>← Loan</Link>
      <h1>Disbursement</h1>
      <ul>{readiness.items.map((item) => <li key={item.id}>{item.complete ? "✓" : "○"} {item.label}{item.detail ? ` — ${item.detail}` : ""}</li>)}</ul>
      {loan.disbursedAt ? (
        <p className="hint">Already disbursed on {loan.disbursedAt.slice(0, 10)}.</p>
      ) : (
        <form className="card stack" onSubmit={(event) => void submit(event)}>
          <Field label="Business date" id="business-date">
            <input id="business-date" type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} required />
          </Field>
          <Field label="Method">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CHEQUE">Cheque</option>
              <option value="MOBILE_WALLET">Mobile wallet</option>
              <option value="CARD">Card</option>
            </select>
          </Field>
          {submitError ? <p className="error">{errorMessage(submitError, "Could not disburse")}</p> : null}
          {result ? <p className="hint">Receipt {result} issued.</p> : null}
          <Button type="submit" disabled={!readiness.ready}>Confirm disbursement</Button>
        </form>
      )}
    </main>
  );
}

export function StaffRepaymentPage() {
  const { id = "" } = useParams();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [externalReference, setExternalReference] = useState("");
  const [businessDate, setBusinessDate] = useState(() => aucklandBusinessDate());
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [result, setResult] = useState<string | null>(null);
  const resource = useAsyncResource(id, (loanId, signal) => api<LoanDetail>(`/loans/${loanId}`, { signal }));
  const loan = resource.data;
  const idempotencyKey = useRef(`web-repay-${id}-${crypto.randomUUID()}`);
  const needsReference = method !== "CASH";

  useEffect(() => {
    idempotencyKey.current = `web-repay-${id}-${crypto.randomUUID()}`;
    setSubmitError(null);
    setResult(null);
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!loan) return;
    setSubmitError(null);
    try {
      const response = await postIdempotent<{ receiptNumber: string; balanceAfter: string }>(
        `/loans/${id}/repayments`,
        {
          expectedVersion: loan.version,
          amount,
          businessDate,
          method,
          externalReference: needsReference ? externalReference : undefined,
        },
        idempotencyKey.current,
      );
      setResult(`${response.receiptNumber} · balance ${response.balanceAfter}`);
      setAmount("");
      // A new version comes back with every posting, so the next repayment
      // needs the refreshed loan rather than the version this page started on.
      idempotencyKey.current = `web-repay-${id}-${crypto.randomUUID()}`;
      resource.setData(await api<LoanDetail>(`/loans/${id}`));
    } catch (err) {
      setSubmitError(err);
    }
  }

  if (!loan) {
    return (
      <main className="staff-page">
        <ResourceGate
          loading={resource.loading}
          error={resource.error}
          ready={false}
          onRetry={resource.retry}
          loadingLabel="Loading…"
          errorFallback="Could not load loan"
        />
      </main>
    );
  }
  const repay = actionFor(loan, "repay");
  return (
    <main className="staff-page">
      <Link to={`/staff/loans/${id}`}>← Loan</Link>
      <h1>Repayment</h1>
      <p className="hint">Outstanding balance: {loan.balance}</p>
      {repay?.allowed ? (
        <form className="card stack" onSubmit={(event) => void submit(event)}>
          <Field label="Amount" error={fieldError(submitError, "amount")}>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <Field label="Business date" id="business-date">
            <input id="business-date" type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} required />
          </Field>
          <Field label="Method">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CHEQUE">Cheque</option>
              <option value="MOBILE_WALLET">Mobile wallet</option>
              <option value="CARD">Card</option>
            </select>
          </Field>
          {needsReference ? (
            <Field label="External reference" error={fieldError(submitError, "externalReference")}>
              <input value={externalReference} onChange={(e) => setExternalReference(e.target.value)} required />
            </Field>
          ) : null}
          {submitError ? <p className="error">{errorMessage(submitError, "Could not record repayment")}</p> : null}
          {result ? <p className="hint">{result}</p> : null}
          <Button type="submit">Record repayment</Button>
        </form>
      ) : (
        <p className="hint">{repay?.reason ?? "Repayments are not available for this loan."}</p>
      )}
    </main>
  );
}

export function StaffCollateralPage() {
  const [data, setData] = useState<CursorListResponse<AssetView> | null>(null);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const path = submitted ? `/assets?q=${encodeURIComponent(submitted)}` : "/assets";
    void api<CursorListResponse<AssetView>>(path).then(setData).catch(setError);
  }, [submitted]);
  return (
    <main className="staff-page">
      <h1>Collateral</h1>
      <form
        className="hero-actions"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(query.trim());
        }}
      >
        <Field label="Search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Asset, borrower name or number"
          />
        </Field>
        <Button type="submit">Search</Button>
      </form>
      {error ? <p className="error">{errorMessage(error, "Could not load collateral")}</p> : null}
      <table className="data-table">
        <thead><tr><th>Asset</th><th>Borrower</th><th>Loan</th><th>Status</th><th>Location</th></tr></thead>
        <tbody>
          {data?.items.length ? data.items.map((row) => (
            <tr key={row.id}>
              <td><Link to={`/staff/collateral/${row.id}`}>{row.name}</Link></td>
              <td>{borrowerLabel(row.borrower)}</td>
              <td>{row.loanNumber ?? "—"}</td>
              <td>{row.status}</td>
              <td>{placeLabel(row)}</td>
            </tr>
          )) : (
            <tr><td colSpan={5} className="empty-row">No collateral items yet.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

export function StaffCollateralDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [asset, setAsset] = useState<AssetView | null>(null);
  const [tab, setTab] = useState<"overview" | "history">("overview");
  const [history, setHistory] = useState<AssetHistoryEntry[] | null>(null);
  const [receivedOn, setReceivedOn] = useState(() => aucklandBusinessDate());
  const [inspectedOn, setInspectedOn] = useState(() => aucklandBusinessDate());
  const [inspectionResult, setInspectionResult] = useState("PASS");
  const [inspectionNote, setInspectionNote] = useState("");
  const [storageLocationId, setStorageLocationId] = useState("");
  const [relocateLocationId, setRelocateLocationId] = useState("");
  const [relocateReason, setRelocateReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const canRelocate = user?.role === "VALUATION_OFFICER";

  useEffect(() => {
    void api<AssetView>(`/assets/${id}`).then(setAsset).catch(setError);
  }, [id]);

  useEffect(() => {
    if (tab !== "history") return;
    void api<AssetHistoryEntry[]>(`/assets/${id}/history`).then(setHistory).catch(setError);
  }, [tab, id, asset?.version]);

  async function intake(event: FormEvent) {
    event.preventDefault();
    if (!asset) return;
    setError(null);
    try {
      const saved = await api<AssetView>(`/assets/${id}/intake`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: asset.version,
          receivedOn,
          inspectedOn,
          inspectionResult,
          // A failed inspection must explain itself; a pass must name a location.
          inspectionNote: inspectionResult === "FAIL" ? inspectionNote : undefined,
          storageLocationId: inspectionResult === "PASS" ? storageLocationId : undefined,
        }),
      });
      setAsset(saved);
      setHistory(null);
    } catch (err) {
      setError(err);
    }
  }

  async function relocate(event: FormEvent) {
    event.preventDefault();
    if (!asset) return;
    setError(null);
    try {
      const saved = await api<AssetView>(`/assets/${id}/custody`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: asset.version,
          storageLocationId: relocateLocationId,
          reason: relocateReason,
        }),
      });
      setAsset(saved);
      setRelocateReason("");
      setHistory(null);
    } catch (err) {
      setError(err);
    }
  }

  if (error && !asset) return <main className="staff-page"><p className="error">{errorMessage(error, "Could not load asset")}</p></main>;
  if (!asset) return <main className="staff-page"><p>Loading…</p></main>;
  const intakeAction = asset.allowedActions.find((action) => action.id === "intake");
  const returnAction = asset.allowedActions.find((action) => action.id === "return");
  const saleAction = asset.allowedActions.find((action) => action.id === "sale");
  return (
    <main className="staff-page">
      <Link to="/staff/collateral">← Collateral</Link>
      <h1>{asset.name}</h1>
      <p className="hint">
        {borrowerLabel(asset.borrower)} · {asset.loanNumber ?? "No loan"} · {asset.status} · valuation {asset.valuationStatus ?? "none"}
      </p>
      <div className="hero-actions">
        <button type="button" className={tab === "overview" ? "btn btn-primary" : "btn btn-secondary"} onClick={() => setTab("overview")}>Overview</button>
        <button type="button" className={tab === "history" ? "btn btn-primary" : "btn btn-secondary"} onClick={() => setTab("history")}>History</button>
        {returnAction?.allowed ? <Link className="btn btn-secondary" to={`/staff/collateral/${id}/return`}>Return</Link> : null}
        {saleAction?.allowed ? <Link className="btn btn-secondary" to={`/staff/collateral/${id}/sale`}>Record sale</Link> : null}
      </div>
      {tab === "history" ? (
        history ? (
          history.length ? (
            <table className="data-table">
              <thead><tr><th>When</th><th>Who</th><th>What happened</th></tr></thead>
              <tbody>
                {history.map((entry, index) => (
                  <tr key={`${entry.at}-${entry.kind}-${entry.action}-${index}`}>
                    <td>{entry.at.replace("T", " ").slice(0, 16)}</td>
                    <td>{entry.actor ?? "—"}</td>
                    <td>{entry.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hint">No history yet.</p>
          )
        ) : (
          <p className="hint">Loading history…</p>
        )
      ) : (
        <>
          {asset.status === "STORED" ? (
            <>
              <p className="hint">Stored at {placeLabel(asset)}</p>
              {canRelocate ? (
                <form className="card stack" onSubmit={(event) => void relocate(event)}>
                  <h2>Move to another location</h2>
                  <StorageLocationField value={relocateLocationId} onChange={setRelocateLocationId} />
                  <Field label="Reason" error={fieldError(error, "reason")}>
                    <input value={relocateReason} onChange={(event) => setRelocateReason(event.target.value)} required />
                  </Field>
                  {error ? <p className="error">{errorMessage(error, "Could not move the asset")}</p> : null}
                  <Button type="submit">Move asset</Button>
                </form>
              ) : null}
            </>
          ) : intakeAction?.allowed ? (
            <form className="card stack" onSubmit={(event) => void intake(event)}>
              <Field label="Received on">
                <input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} required />
              </Field>
              <Field label="Inspected on">
                <input type="date" value={inspectedOn} onChange={(e) => setInspectedOn(e.target.value)} required />
              </Field>
              <Field label="Inspection result">
                <select value={inspectionResult} onChange={(e) => setInspectionResult(e.target.value)}>
                  <option value="PASS">Pass — matches the valuation</option>
                  <option value="FAIL">Fail — does not match</option>
                </select>
              </Field>
              {inspectionResult === "PASS" ? (
                <StorageLocationField value={storageLocationId} onChange={setStorageLocationId} />
              ) : (
                <Field label="What did not match" error={fieldError(error, "inspectionNote")}>
                  <input value={inspectionNote} onChange={(e) => setInspectionNote(e.target.value)} required />
                </Field>
              )}
              {error ? <p className="error">{errorMessage(error, "Could not confirm intake")}</p> : null}
              <Button type="submit">Confirm intake</Button>
            </form>
          ) : (
            <p className="hint">{intakeAction?.reason ?? "This asset cannot be taken into custody yet."}</p>
          )}
          {asset.custody.length ? (
            <table className="data-table">
              <thead><tr><th>Date</th><th>Event</th><th>Location</th><th>Recorded by</th></tr></thead>
              <tbody>
                {asset.custody.map((event) => (
                  <tr key={event.id}>
                    <td>{event.businessDate}</td>
                    <td>{event.type}</td>
                    <td>{event.location ?? "—"}</td>
                    <td>{event.recordedBy ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      )}
    </main>
  );
}

type TransactionView = {
  id: string;
  loanNumber: string | null;
  borrowerName: string | null;
  type: string;
  amount: string;
  businessDate: string;
  method: string;
  receiptNumber: string | null;
};

export function StaffTransactionsPage() {
  const [data, setData] = useState<CursorListResponse<TransactionView> | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    void api<CursorListResponse<TransactionView>>("/transactions").then(setData).catch(setError);
  }, []);
  return (
    <main className="staff-page">
      <div className="section-head">
        <h1>Transactions</h1>
        <a className="btn btn-secondary" href="/api/v1/transactions/export.csv">
          Export CSV
        </a>
      </div>
      {error ? <p className="error">{errorMessage(error, "Could not load transactions")}</p> : null}
      <table className="data-table">
        <thead><tr><th>Date</th><th>Loan</th><th>Type</th><th>Amount</th><th>Receipt</th></tr></thead>
        <tbody>
          {data?.items.length ? data.items.map((row) => (
            <tr key={row.id}>
              <td>{row.businessDate}</td>
              <td><Link to={`/staff/transactions/${row.id}`}>{row.loanNumber}</Link></td>
              <td>{row.type}</td>
              <td>{row.amount}</td>
              <td>{row.receiptNumber ?? "—"}</td>
            </tr>
          )) : (
            <tr><td colSpan={5} className="empty-row">No transactions yet.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

export function StaffTransactionDetailPage() {
  const { id = "" } = useParams();
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    void api<Record<string, unknown>>(`/transactions/${id}`).then(setItem).catch(setError);
  }, [id]);
  if (error) return <main className="staff-page"><p className="error">{errorMessage(error, "Could not load transaction")}</p></main>;
  if (!item) return <main className="staff-page"><p>Loading…</p></main>;
  return (
    <main className="staff-page">
      <Link to="/staff/transactions">← Transactions</Link>
      <h1>Transaction</h1>
      <dl className="detail-list">
        <dt>Loan</dt><dd>{String(item.loanNumber ?? "—")}</dd>
        <dt>Borrower</dt><dd>{String(item.borrowerName ?? "—")}</dd>
        <dt>Type</dt><dd>{String(item.type)}</dd>
        <dt>Amount</dt><dd>{String(item.amount)}</dd>
        <dt>Business date</dt><dd>{String(item.businessDate)}</dd>
        <dt>Method</dt><dd>{String(item.method)}</dd>
        <dt>Reference</dt><dd>{String(item.externalReference ?? "—")}</dd>
        <dt>Note</dt><dd>{String(item.note ?? "—")}</dd>
        <dt>Posted by</dt><dd>{String(item.postedBy ?? "—")}</dd>
        <dt>Receipt</dt>
        <dd>
          {item.receiptId ? (
            <Link to={`/staff/receipts/${String(item.receiptId)}`}>{String(item.receiptNumber ?? item.receiptId)}</Link>
          ) : (
            "—"
          )}
        </dd>
      </dl>
      <pre>{JSON.stringify(item, null, 2)}</pre>
    </main>
  );
}

type ReceiptView = {
  id: string;
  number: string;
  loanId: string;
  loanNumber: string | null;
  issuedBy: string | null;
  createdAt: string;
  summary: Record<string, unknown>;
};

export function StaffReceiptPage() {
  const { id = "" } = useParams();
  const [receipt, setReceipt] = useState<ReceiptView | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    void api<ReceiptView>(`/receipts/${id}`).then(setReceipt).catch(setError);
  }, [id]);
  if (error) return <main className="staff-page"><p className="error">{errorMessage(error, "Could not load receipt")}</p></main>;
  if (!receipt) return <main className="staff-page"><p>Loading…</p></main>;
  const summary = receipt.summary as {
    type?: string;
    amount?: string;
    businessDate?: string;
    method?: string;
    balanceAfter?: string;
  };
  return (
    <main className="staff-page">
      <Link to="/staff/transactions">← Transactions</Link>
      <h1>Receipt {receipt.number}</h1>
      <dl className="detail-list">
        <dt>Loan</dt><dd>{receipt.loanNumber ?? "—"}</dd>
        <dt>Type</dt><dd>{summary.type ?? "—"}</dd>
        <dt>Amount</dt><dd>{summary.amount ?? "—"}</dd>
        <dt>Business date</dt><dd>{summary.businessDate ?? "—"}</dd>
        <dt>Method</dt><dd>{summary.method ?? "—"}</dd>
        <dt>Balance after</dt><dd>{summary.balanceAfter ?? "—"}</dd>
        <dt>Issued by</dt><dd>{receipt.issuedBy ?? "—"}</dd>
        <dt>Issued at</dt><dd>{receipt.createdAt.slice(0, 10)}</dd>
      </dl>
      <button type="button" className="btn btn-primary" onClick={() => window.print()}>
        Print receipt
      </button>
      <pre className="no-print">{JSON.stringify(receipt.summary, null, 2)}</pre>
    </main>
  );
}

export function ApplicationReviewPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [review, setReview] = useState<Review | null>(null);
  const [reason, setReason] = useState("");
  const [publicNote, setPublicNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    void api<Review>(`/applications/${id}/review`).then(setReview).catch(setError);
  }, [id]);

  async function decide(decision: "approve" | "decline") {
    if (!review) return;
    setError(null);
    try {
      const result = await api<{ outcome: string; loanNumber?: string | null }>(
        `/applications/${id}/decision`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: review.version,
            decision,
            reviewed: decision === "approve" ? true : undefined,
            reason: decision === "decline" ? reason : undefined,
            publicNote: decision === "decline" ? publicNote : undefined,
          }),
        },
      );
      setOutcome(result.loanNumber ? `Approved · ${result.loanNumber}` : result.outcome);
      setReview(await api<Review>(`/applications/${id}/review`));
    } catch (err) {
      setError(err);
    }
  }

  if (error && !review) return <main className="staff-page"><p className="error">{errorMessage(error, "Could not load review")}</p></main>;
  if (!review) return <main className="staff-page"><p>Loading review…</p></main>;
  const decided = review.checks.find((check) => check.id === "no-loan")?.complete === false;
  const officerView = user?.role !== "MANAGER";
  return (
    <main className="staff-page">
      <Link to="/staff/applications">← Applications</Link>
      <h1>Manager review</h1>
      <p className="hint">
        {review.number ?? ""}{review.borrowerName ? ` · ${review.borrowerName}` : ""}
        {review.requestedAmount ? ` · Requested $${review.requestedAmount}` : ""}
        {review.valuationTotal ? ` · Security valued $${review.valuationTotal}` : ""}
        {review.purpose ? ` · ${review.purpose}` : ""}
        {review.proposedTermMonths ? ` · ${review.proposedTermMonths} months` : ""}
      </p>
      {review.assets?.length ? (
        <ul>
          {review.assets.map((asset) => (
            <li key={asset.id}>
              {asset.name} · {asset.photoCount} photo(s) · valuation {asset.valuationAmount ? `$${asset.valuationAmount}` : asset.valuationStatus ?? "requested"}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="hint">
        <Link to={`/staff/applications/${id}/valuation`}>Valuation</Link>
        {" · "}
        <Link to={`/staff/applications/${id}/edit/terms`}>Repayment terms</Link>
      </p>
      {officerView ? (
        <p className="hint">Approval is a manager decision. Submit the file for manager review.</p>
      ) : (
        <p className="hint">
          A manager decides every application.
          {review.managerReasons?.length ? ` ${review.managerReasons.join(" ")}` : ""}
        </p>
      )}
      <ul>{review.checks.map((check) => <li key={check.id}>{check.complete ? "✓" : "○"} {check.label}</li>)}</ul>
      {decided ? (
        <p className="hint">This application already has a decision.</p>
      ) : officerView ? null : (
        <>
          <Field label="Reason (required to decline)">
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Public note (shown to the customer)">
            <textarea value={publicNote} onChange={(e) => setPublicNote(e.target.value)} />
          </Field>
          {error ? <p className="error">{errorMessage(error, "Decision failed")}</p> : null}
          {outcome ? <p className="hint">{outcome}</p> : null}
          <div className="hero-actions">
            <Button onClick={() => void decide("approve")} disabled={!review.canApprove}>Approve</Button>
            <Button variant="secondary" onClick={() => void decide("decline")} disabled={!review.canDecline || !reason.trim()}>Decline</Button>
          </div>
        </>
      )}
    </main>
  );
}
