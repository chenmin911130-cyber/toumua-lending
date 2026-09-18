import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { NotificationListResponse } from "@toumua/contracts";
import { api, errorMessage } from "../api";
import { formatDateTime } from "../format";
import { useAuth } from "../auth";

export function NotificationsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  async function reload() {
    const next = await api<NotificationListResponse>("/notifications");
    setData(next);
  }

  useEffect(() => {
    void reload().catch(setError);
  }, []);

  async function markRead(id: string) {
    setPending(true);
    setError(null);
    try {
      await api(`/notifications/${id}/read`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  async function markAllRead() {
    setPending(true);
    setError(null);
    try {
      await api("/notifications/read-all", { method: "POST" });
      await reload();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  const shellClass = user?.isStaff ? "staff-page" : "page";

  if (error && !data) {
    return (
      <main className={shellClass}>
        <p className="error">{errorMessage(error, "Could not load notifications")}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className={shellClass}>
        <p>Loading notifications…</p>
      </main>
    );
  }

  return (
    <main className={shellClass}>
      <div className="section-head">
        <div>
          <h1>Notifications</h1>
          <p className="hint">
            {data.unread > 0 ? `${data.unread} unread` : "All caught up"}
          </p>
        </div>
        {data.unread > 0 ? (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => void markAllRead()}>
            Mark all read
          </button>
        ) : null}
      </div>
      {error ? <p className="error">{errorMessage(error, "Could not update notifications")}</p> : null}
      {data.total === 0 ? (
        <section className="center-state" style={{ marginTop: 48 }}>
          <div className="center-icon" aria-hidden>✓</div>
          <h2>All caught up</h2>
          <p className="empty-copy">
            You do not have any notifications right now. When the office sends updates about your applications or loans, they will appear here.
          </p>
          <Link className="btn btn-primary" to={user?.isStaff ? "/staff" : "/customer"}>
            Back to overview
          </Link>
        </section>
      ) : (
        <section className="stack" style={{ maxWidth: 760 }}>
          {data.items.map((item) => (
            <article key={item.id} className="card stack">
              <div>
                <strong>{item.title}</strong>
                {!item.read ? <span className="pill" style={{ marginLeft: 8 }}>Unread</span> : null}
              </div>
              <p>{item.body}</p>
              <div className="hero-actions">
                {item.href ? (
                  <Link className="btn btn-primary" to={item.href}>Open</Link>
                ) : null}
                {!item.read ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() => void markRead(item.id)}
                  >
                    Mark read
                  </button>
                ) : null}
              </div>
              <span className="hint">{formatDateTime(item.createdAt)}</span>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
