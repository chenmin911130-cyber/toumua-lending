import { FormEvent, useEffect, useState } from "react";
import type { CursorListResponse, ReminderRunResult, SmsOutboxItem } from "@toumua/contracts";
import { Button, Field } from "@toumua/ui";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth";
import { aucklandBusinessDate, formatDateTime } from "../format";

type RunResult = ReminderRunResult;

export function StaffRemindersPage() {
  const { user } = useAuth();
  const canRun = user?.role === "MANAGER";
  const [asOf, setAsOf] = useState(aucklandBusinessDate);
  const [result, setResult] = useState<RunResult | null>(null);
  const [outbox, setOutbox] = useState<CursorListResponse<SmsOutboxItem> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);

  async function loadOutbox() {
    const data = await api<CursorListResponse<SmsOutboxItem>>("/sms-outbox?limit=50");
    setOutbox(data);
  }

  useEffect(() => {
    void loadOutbox().catch(setError);
  }, []);

  async function run(event: FormEvent) {
    event.preventDefault();
    setRunning(true);
    setError(null);
    try {
      const body = asOf ? { asOf } : {};
      const counts = await api<RunResult>("/reminders/run", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(counts);
      await loadOutbox();
    } catch (err) {
      setError(err);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="staff-page">
      <h1>Reminders</h1>
      {canRun ? (
        <form className="hero-actions" onSubmit={(event) => void run(event)}>
          <Field label="As of">
            <input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          </Field>
          <Button type="submit" disabled={running}>
            {running ? "Running…" : "Run reminders now"}
          </Button>
        </form>
      ) : null}
      {error ? <p className="error">{errorMessage(error, "Could not load reminders")}</p> : null}
      {result ? (
        <p>
          {result.dueSoon} due soon · {result.dueToday} due today · {result.overdue} overdue · {result.failed} failed
        </p>
      ) : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Phone</th>
            <th>Borrower</th>
            <th>Message</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {outbox?.items.length ? (
            outbox.items.map((item) => (
              <tr key={item.id}>
                <td>{formatDateTime(item.createdAt)}</td>
                <td>{item.phoneMasked}</td>
                <td>{item.borrowerName ?? "—"}</td>
                <td>{item.body}</td>
                <td>{item.status}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5}>No messages yet</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
