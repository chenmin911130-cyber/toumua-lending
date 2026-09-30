import { FormEvent, useState } from "react";
import { Button, Field } from "@toumua/ui";
import type { ArrangementSummary } from "@toumua/contracts";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";

export function AutomaticRepaymentsCard({
  loanId,
  arrangement,
  mode,
  onChange,
}: {
  loanId: string;
  arrangement: ArrangementSummary | null;
  mode: "customer" | "staff";
  onChange: (next: ArrangementSummary | null) => void;
}) {
  const { user } = useAuth();
  const [method, setMethod] = useState<"BANK_AUTOMATIC_PAYMENT" | "DIRECT_DEBIT">("BANK_AUTOMATIC_PAYMENT");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [consent, setConsent] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const canActivate = user?.role === "CASHIER" || user?.role === "MANAGER";
  const canCancelStaff = user?.role === "LOAN_OFFICER" || canActivate;

  async function request(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const path = mode === "customer" ? `/me/loans/${loanId}/arrangements` : `/loans/${loanId}/arrangements`;
      const saved = await api<ArrangementSummary>(path, {
        method: "POST",
        body: JSON.stringify({
          method,
          accountName,
          accountNumber,
          bankName: bankName || null,
          consent: true,
        }),
      });
      onChange(saved);
    } catch (caught) {
      setError(caught);
    }
  }

  async function activate() {
    if (!arrangement) return;
    setError(null);
    try {
      onChange(await api<ArrangementSummary>(`/arrangements/${arrangement.id}/activate`, { method: "POST" }));
    } catch (caught) {
      setError(caught);
    }
  }

  async function cancel(event: FormEvent) {
    event.preventDefault();
    if (!arrangement) return;
    setError(null);
    try {
      const path = mode === "customer"
        ? `/me/loans/${loanId}/arrangements/cancel`
        : `/arrangements/${arrangement.id}/cancel`;
      onChange(await api<ArrangementSummary>(path, { method: "POST", body: JSON.stringify({ reason }) }));
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <section className="card stack" style={{ marginTop: 24 }}>
      <h2>Automatic repayments</h2>
      {arrangement?.status === "REQUESTED" ? (
        <p>Requested — we'll confirm once your bank authority is received</p>
      ) : null}
      {arrangement?.status === "ACTIVE" ? (
        <p>Active · account ending {arrangement.accountNumberLast4}. The next repayment will be collected automatically.</p>
      ) : null}
      {arrangement?.status === "CANCELLED" ? <p>Cancelled. {arrangement.cancelReason}</p> : null}
      {!arrangement ? (
        <form className="stack" onSubmit={(event) => void request(event)}>
          <p className="hint">Set up automatic repayments</p>
          <Field label="Method">
            <select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
              <option value="BANK_AUTOMATIC_PAYMENT">Bank automatic payment</option>
              <option value="DIRECT_DEBIT">Direct debit</option>
            </select>
          </Field>
          <Field label="Account name">
            <input value={accountName} onChange={(event) => setAccountName(event.target.value)} required />
          </Field>
          <Field label="Account number">
            <input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="12-3456-1234567-012" required />
          </Field>
          <Field label="Bank">
            <input value={bankName} onChange={(event) => setBankName(event.target.value)} />
          </Field>
          <label className="checkbox-row">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            The borrower agrees to this automatic repayment
          </label>
          <Button type="submit" disabled={!consent}>Set up automatic repayments</Button>
        </form>
      ) : null}
      {arrangement && arrangement.status !== "CANCELLED" ? (
        <form className="stack" onSubmit={(event) => void cancel(event)}>
          {mode === "staff" && arrangement.status === "REQUESTED" && canActivate ? (
            <Button type="button" onClick={() => void activate()}>Activate</Button>
          ) : null}
          {mode === "customer" || canCancelStaff ? (
            <>
              <Field label="Cancellation reason">
                <input value={reason} onChange={(event) => setReason(event.target.value)} required />
              </Field>
              <Button type="submit" variant="secondary">Cancel automatic repayments</Button>
            </>
          ) : null}
        </form>
      ) : null}
      {error ? <p className="error">{errorMessage(error, "Could not update automatic repayments")}</p> : null}
    </section>
  );
}
