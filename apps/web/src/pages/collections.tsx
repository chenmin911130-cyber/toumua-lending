import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Field } from "@toumua/ui";
import type { CollectionRow } from "@toumua/contracts";
import { api, errorMessage } from "../api";
import { aucklandBusinessDate } from "../format";
import { useAuth } from "../auth";

export function StaffCollectionsPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(() => aucklandBusinessDate());
  const [items, setItems] = useState<CollectionRow[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const response = await api<{ items: CollectionRow[] }>(`/arrangements/collections?date=${date}`);
      setItems(response.items);
    } catch (caught) {
      setError(caught);
    }
  }

  async function mark(row: CollectionRow) {
    setError(null);
    try {
      const amount = amounts[row.scheduleEntryId]?.trim();
      await api(`/arrangements/collections/${row.scheduleEntryId}/post?date=${date}`, {
        method: "POST",
        body: JSON.stringify({
          received: true,
          ...(amount ? { amount } : {}),
          externalReference: refs[row.scheduleEntryId] || null,
        }),
      });
      setItems((current) => current?.filter((item) => item.scheduleEntryId !== row.scheduleEntryId) ?? []);
      setNotice(`Receipt posted for ${row.loanNumber} installment ${row.installmentNumber}.`);
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <main className="staff-page">
      <h1>Collections</h1>
      <form className="stack" onSubmit={(event) => void load(event)}>
        <Field label="Date">
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </Field>
        <Button type="submit">Show due collections</Button>
      </form>
      {error ? <p className="error">{errorMessage(error, "Could not load collections")}</p> : null}
      {notice ? <p className="hint">{notice}</p> : null}
      {items ? (
        <table className="data-table">
          <thead>
            <tr><th>Loan</th><th>Borrower</th><th>#</th><th>Due</th><th>Amount</th><th>Reference</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.scheduleEntryId}>
                <td><Link to={`/staff/loans/${row.loanId}`}>{row.loanNumber}</Link></td>
                <td>{row.borrowerName}</td>
                <td>{row.installmentNumber}</td>
                <td>{row.dueDate}</td>
                <td>
                  <input
                    value={amounts[row.scheduleEntryId] ?? row.amount}
                    onChange={(event) => setAmounts((current) => ({ ...current, [row.scheduleEntryId]: event.target.value }))}
                  />
                </td>
                <td>
                  <input
                    value={refs[row.scheduleEntryId] ?? ""}
                    onChange={(event) => setRefs((current) => ({ ...current, [row.scheduleEntryId]: event.target.value }))}
                  />
                </td>
                <td>
                  {user?.role === "CASHIER" ? (
                    <Button type="button" onClick={() => void mark(row)}>Mark received</Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </main>
  );
}
