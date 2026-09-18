import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Field } from "@toumua/ui";
import type { CorrectionView, CursorListResponse, LoanDetail } from "@toumua/contracts";
import { api, errorMessage, fieldError, postIdempotent } from "../api";

type AssetView = {
  id: string;
  name: string;
  loanNumber: string | null;
  status: string;
  version: number;
  allowedActions: Array<{ id: string; allowed: boolean; reason?: string }>;
};

type PaymentAttemptView = {
  id: string;
  type: string;
  status: string;
  loanNumber: string | null;
  receiptId: string | null;
  failureReason: string | null;
  requestBody: Record<string, unknown>;
};

export function StaffDefaultPage() {
  const { id = "" } = useParams();
  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [reason, setReason] = useState("");
  const [policyBasis, setPolicyBasis] = useState("");
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void api<LoanDetail>(`/loans/${id}`).then(setLoan).catch(setError);
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!loan) return;
    setError(null);
    try {
      await api(`/loans/${id}/default`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: loan.version,
          businessDate,
          reason,
          policyBasis,
        }),
      });
      window.location.href = `/staff/loans/${id}`;
    } catch (err) {
      setError(err);
    }
  }

  if (!loan) return <main className="staff-page"><p>Loading…</p></main>;
  return (
    <main className="staff-page">
      <Link to={`/staff/loans/${id}`}>← Loan</Link>
      <h1>Declare default</h1>
      <form className="card stack" onSubmit={(event) => void submit(event)}>
        <Field label="Default date">
          <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} required />
        </Field>
        <Field label="Policy basis" error={fieldError(error, "policyBasis")}>
          <input value={policyBasis} onChange={(e) => setPolicyBasis(e.target.value)} required />
        </Field>
        <Field label="Reason" error={fieldError(error, "reason")}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>
        {error ? <p className="error">{errorMessage(error, "Could not declare default")}</p> : null}
        <Button type="submit">Confirm default</Button>
      </form>
    </main>
  );
}

export function StaffSaleReceiptPage() {
  const { id = "" } = useParams();
  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<string | null>(null);
  const idempotencyKey = useRef(`web-sale-${id}-${crypto.randomUUID()}`);

  useEffect(() => {
    void api<LoanDetail>(`/loans/${id}`).then(setLoan).catch(setError);
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!loan) return;
    setError(null);
    try {
      const response = await postIdempotent<{ receiptNumber: string; balanceAfter: string }>(
        `/loans/${id}/sale-receipts`,
        { expectedVersion: loan.version, amount, businessDate, method },
        idempotencyKey.current,
      );
      setResult(`${response.receiptNumber} · balance ${response.balanceAfter}`);
      setLoan(await api<LoanDetail>(`/loans/${id}`));
    } catch (err) {
      setError(err);
    }
  }

  if (!loan) return <main className="staff-page"><p>Loading…</p></main>;
  return (
    <main className="staff-page">
      <Link to={`/staff/loans/${id}`}>← Loan</Link>
      <h1>Sale proceeds</h1>
      <p className="hint">Outstanding balance: {loan.balance}</p>
      <form className="card stack" onSubmit={(event) => void submit(event)}>
        <Field label="Amount" error={fieldError(error, "amount")}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Business date">
          <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} required />
        </Field>
        <Field label="Method">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">Cash</option>
          </select>
        </Field>
        {error ? <p className="error">{errorMessage(error, "Could not record sale proceeds")}</p> : null}
        {result ? <p className="hint">{result}</p> : null}
        <Button type="submit">Record sale proceeds</Button>
      </form>
    </main>
  );
}

export function StaffReturnPage() {
  const { id = "" } = useParams();
  const [asset, setAsset] = useState<AssetView | null>(null);
  const [returnedOn, setReturnedOn] = useState(new Date().toISOString().slice(0, 10));
  const [recipientName, setRecipientName] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void api<AssetView>(`/assets/${id}`).then(setAsset).catch(setError);
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!asset) return;
    setError(null);
    try {
      const saved = await api<AssetView>(`/assets/${id}/return`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: asset.version,
          returnedOn,
          recipientName,
          verificationMethod,
          identityConfirmed: true,
        }),
      });
      setAsset(saved);
    } catch (err) {
      setError(err);
    }
  }

  if (!asset) return <main className="staff-page"><p>Loading…</p></main>;
  const action = asset.allowedActions.find((row) => row.id === "return");
  return (
    <main className="staff-page">
      <Link to={`/staff/collateral/${id}`}>← Collateral</Link>
      <h1>Return {asset.name}</h1>
      {action?.allowed ? (
        <form className="card stack" onSubmit={(event) => void submit(event)}>
          <Field label="Return date">
            <input type="date" value={returnedOn} onChange={(e) => setReturnedOn(e.target.value)} required />
          </Field>
          <Field label="Recipient name" error={fieldError(error, "recipientName")}>
            <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} required />
          </Field>
          <Field label="Verification method" error={fieldError(error, "verificationMethod")}>
            <input value={verificationMethod} onChange={(e) => setVerificationMethod(e.target.value)} required />
          </Field>
          {error ? <p className="error">{errorMessage(error, "Could not record return")}</p> : null}
          <Button type="submit">Confirm return</Button>
        </form>
      ) : (
        <p className="hint">{action?.reason ?? "Return is not available."}</p>
      )}
    </main>
  );
}

export function StaffSalePage() {
  const { id = "" } = useParams();
  const [asset, setAsset] = useState<AssetView | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Private sale");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void api<AssetView>(`/assets/${id}`).then(setAsset).catch(setError);
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!asset) return;
    setError(null);
    try {
      const saved = await api<AssetView>(`/assets/${id}/sale`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: asset.version,
          buyerName,
          buyerContact,
          saleAmount,
          saleDate,
          method,
          notes,
        }),
      });
      setAsset(saved);
    } catch (err) {
      setError(err);
    }
  }

  if (!asset) return <main className="staff-page"><p>Loading…</p></main>;
  const action = asset.allowedActions.find((row) => row.id === "sale");
  return (
    <main className="staff-page">
      <Link to={`/staff/collateral/${id}`}>← Collateral</Link>
      <h1>Record sale · {asset.name}</h1>
      {action?.allowed ? (
        <form className="card stack" onSubmit={(event) => void submit(event)}>
          <Field label="Buyer name"><input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} required /></Field>
          <Field label="Buyer contact"><input value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} required /></Field>
          <Field label="Sale amount"><input value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} required /></Field>
          <Field label="Sale date"><input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required /></Field>
          <Field label="Disposal method"><input value={method} onChange={(e) => setMethod(e.target.value)} required /></Field>
          <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {error ? <p className="error">{errorMessage(error, "Could not record sale")}</p> : null}
          <Button type="submit">Confirm sale</Button>
        </form>
      ) : (
        <p className="hint">{action?.reason ?? "Sale is not available."}</p>
      )}
    </main>
  );
}

export function StaffCorrectionsPage() {
  const [data, setData] = useState<CursorListResponse<CorrectionView> | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    void api<CursorListResponse<CorrectionView>>("/corrections").then(setData).catch(setError);
  }, []);
  return (
    <main className="staff-page">
      <h1>Corrections</h1>
      {error ? <p className="error">{errorMessage(error, "Could not load corrections")}</p> : null}
      <table className="data-table">
        <thead><tr><th>Status</th><th>Reason</th><th>Requested by</th></tr></thead>
        <tbody>
          {data?.items.length ? data.items.map((row) => (
            <tr key={row.id}>
              <td><Link to={`/staff/corrections/${row.id}`}>{row.status}</Link></td>
              <td>{row.reason}</td>
              <td>{row.requestedBy ?? "—"}</td>
            </tr>
          )) : (
            <tr><td colSpan={3} className="empty-row">No correction requests yet.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

export function StaffCorrectionDetailPage() {
  const { id = "" } = useParams();
  const [correction, setCorrection] = useState<CorrectionView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const postKey = useRef(`web-correction-${id}`);

  useEffect(() => {
    void api<CorrectionView>(`/corrections/${id}`).then(setCorrection).catch(setError);
  }, [id]);

  async function decide(decision: "approve" | "reject") {
    if (!correction) return;
    setError(null);
    try {
      setCorrection(
        await api<CorrectionView>(`/corrections/${id}/decision`, {
          method: "POST",
          body: JSON.stringify({ expectedVersion: correction.version, decision }),
        }),
      );
    } catch (err) {
      setError(err);
    }
  }

  async function postCorrection() {
    if (!correction) return;
    setError(null);
    try {
      setCorrection(await postIdempotent<CorrectionView>(`/corrections/${id}/post`, {}, postKey.current));
    } catch (err) {
      setError(err);
    }
  }

  if (!correction) return <main className="staff-page"><p>Loading…</p></main>;
  const decideAction = correction.allowedActions.find((row) => row.id === "decide");
  const postAction = correction.allowedActions.find((row) => row.id === "post");
  return (
    <main className="staff-page">
      <Link to="/staff/corrections">← Corrections</Link>
      <h1>Correction {correction.status}</h1>
      <p className="hint">{correction.reason}</p>
      {correction.originalTransaction ? (
        <p className="hint">
          Original {correction.originalTransaction.type} {correction.originalTransaction.amount} on{" "}
          {correction.originalTransaction.businessDate}
        </p>
      ) : null}
      {error ? <p className="error">{errorMessage(error, "Action failed")}</p> : null}
      <div className="hero-actions">
        {decideAction?.allowed ? (
          <>
            <Button type="button" onClick={() => void decide("approve")}>Approve</Button>
            <Button type="button" variant="secondary" onClick={() => void decide("reject")}>Reject</Button>
          </>
        ) : null}
        {postAction?.allowed ? (
          <Button type="button" onClick={() => void postCorrection()}>Post correction</Button>
        ) : null}
      </div>
    </main>
  );
}

export function StaffPaymentAttemptPage() {
  const { id = "" } = useParams();
  const [attempt, setAttempt] = useState<PaymentAttemptView | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void api<PaymentAttemptView>(`/payment-attempts/${id}`).then(setAttempt).catch(setError);
  }, [id]);

  if (error) return <main className="staff-page"><p className="error">{errorMessage(error, "Could not load attempt")}</p></main>;
  if (!attempt) return <main className="staff-page"><p>Loading…</p></main>;
  return (
    <main className="staff-page">
      <h1>Payment attempt</h1>
      <p className="hint">{attempt.type} · {attempt.status} · loan {attempt.loanNumber ?? "—"}</p>
      {attempt.status === "COMMITTED" && attempt.receiptId ? (
        <p><Link to={`/staff/receipts/${attempt.receiptId}`}>View receipt</Link></p>
      ) : null}
      {attempt.status === "PENDING" || attempt.status === "UNKNOWN" ? (
        <p className="hint">The result is still unknown. Reload this page to check again before sending a new payment.</p>
      ) : null}
      {attempt.failureReason ? <p className="error">{attempt.failureReason}</p> : null}
    </main>
  );
}
