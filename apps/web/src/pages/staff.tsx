import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, Dialog, Field } from "@toumua/ui";
import type { AuditEvent, StaffAccount, StaffBusinessRole } from "@toumua/contracts";
import { api, errorMessage, fieldError } from "../api";
import { LaterModulePage } from "./customer";
import { aucklandDate, roleLabel } from "../format";
import { useAuth } from "../auth";

const ROLES: StaffBusinessRole[] = [
  "LOAN_OFFICER",
  "VALUATION_OFFICER",
  "MANAGER",
  "CASHIER",
  "ACCOUNTANT",
  "OWNER",
];

export function StaffHomePage() {
  const { user } = useAuth();
  return (
    <main className="staff-page">
      <div className="staff-top">
        <span>{aucklandDate()}</span>
        <span>{user?.name}</span>
      </div>
      <h1>Overview</h1>
      <p className="hint">Queues appear here after lending modules are implemented. These figures are empty because no loans have been recorded yet.</p>
      <section className="metrics">
        <article>
          <div className="metric-label">Outstanding principal</div>
          <div className="metric-value">No loans yet</div>
        </article>
        <article>
          <div className="metric-label">Pending applications</div>
          <div className="metric-value">0</div>
        </article>
        <article>
          <div className="metric-label">Due today</div>
          <div className="metric-value">—</div>
        </article>
      </section>
      <div className="section-head">
        <h2>Pending reviews</h2>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Application</th>
            <th>Borrower</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="empty-row" colSpan={4}>No applications are waiting for review.</td></tr>
        </tbody>
      </table>
      <div className="section-head">
        <h2>Recent transactions</h2>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Loan</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="empty-row" colSpan={4}>No transactions have been recorded.</td></tr>
        </tbody>
      </table>
    </main>
  );
}

export function StaffAccountsPage() {
  const [items, setItems] = useState<StaffAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<StaffAccount | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffBusinessRole | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState<"role" | "deactivate" | "reactivate" | "revoke" | "permissions" | null>(null);
  const [nextRole, setNextRole] = useState<StaffBusinessRole>("CASHIER");
  const [manageStaff, setManageStaff] = useState(false);
  const [viewAudit, setViewAudit] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");

  async function reload() {
    const data = await api<{ items: StaffAccount[] }>("/staff");
    setItems(data.items);
  }

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const haystack = `${item.name} ${item.email}`.toLowerCase();
      const matchesQuery = haystack.includes(query.toLowerCase().trim());
      const matchesStatus = status === "ALL" || item.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [items, query, status]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api("/staff", {
        method: "POST",
        body: JSON.stringify({ name, email, role }),
      });
      setOpen(false);
      setName("");
      setEmail("");
      setRole("");
      await reload();
    } catch (err) {
      setError(err);
    }
  }

  async function runStatus(next: "INACTIVE" | "ACTIVE" | "INVITATION_REVOKED") {
    if (!selected) return;
    setError(null);
    try {
      await api(`/staff/${selected.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next, reason }),
      });
      setConfirm(null);
      setReason("");
      await reload();
      setSelected(await api<StaffAccount>(`/staff/${selected.id}`));
    } catch (err) {
      setError(err);
    }
  }

  async function saveRole() {
    if (!selected) return;
    setError(null);
    try {
      const updated = await api<StaffAccount>(`/staff/${selected.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole, reason }),
      });
      setSelected(updated);
      setConfirm(null);
      setReason("");
      await reload();
    } catch (err) {
      setError(err);
    }
  }

  async function savePermissions() {
    if (!selected) return;
    const permissions = [
      ...(manageStaff ? ["manage_staff"] : []),
      ...(viewAudit ? ["view_audit"] : []),
    ];
    setError(null);
    try {
      const updated = await api<StaffAccount>(`/staff/${selected.id}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permissions, reason }),
      });
      setSelected(updated);
      setConfirm(null);
      setReason("");
      await reload();
    } catch (err) {
      setError(err);
    }
  }

  function openPerson(item: StaffAccount) {
    setSelected(item);
    setNextRole((item.role ?? "CASHIER") as StaffBusinessRole);
    setManageStaff(item.permissions.includes("manage_staff"));
    setViewAudit(item.permissions.includes("view_audit"));
    setConfirm(null);
  }

  return (
    <main className="staff-page">
      <div className="staff-top">
        <span>{aucklandDate()}</span>
      </div>
      <div className="section-head">
        <h1>Staff accounts</h1>
        <Button controlId="S16-01" type="button" onClick={() => { setOpen(true); setError(null); }}>Invite staff</Button>
      </div>
      <div className="staff-toolbar">
        <input
          type="search"
          placeholder="Search name or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search name or email"
        />
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status">
          <option value="ALL">All</option>
          <option value="ACTIVE">Active</option>
          <option value="INVITED">Invited</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td className="empty-row" colSpan={4}>{items.length === 0 ? "No staff accounts yet." : "No results"}</td></tr>
          ) : null}
          {filtered.map((item) => (
            <tr key={item.id}>
              <td>
                <button type="button" className="btn btn-ghost" data-control-id="S16-03" onClick={() => openPerson(item)}>
                  {item.name}
                </button>
              </td>
              <td>{item.email}</td>
              <td>{roleLabel(item.role)}</td>
              <td><span className="pill">{item.status === "INVITED" ? "Invited" : item.status === "INACTIVE" ? "Inactive" : "Active"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog title="Invite staff" open={open} onClose={() => setOpen(false)}>
        <p className="hint">Account administration is granted separately from business roles.</p>
        <form onSubmit={(event) => void invite(event)}>
          <Field label="Full name" name="name" value={name} onChange={(e) => setName(e.target.value)} error={fieldError(error, "name")} />
          <Field label="Email address" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError(error, "email")} />
          <div className="field">
            <label htmlFor="role">Role</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value as StaffBusinessRole)} required>
              <option value="">Select role</option>
              {ROLES.map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}
            </select>
          </div>
          {error ? <p className="field-error">{errorMessage(error, "Invitation was not sent")}</p> : null}
          <Button controlId="S16-02" className="btn-block" type="submit">Send invitation</Button>
        </form>
      </Dialog>

      {selected ? (
        <Dialog title={selected.name} open onClose={() => setSelected(null)}>
          <p>{selected.email}</p>
          <p>Role: {roleLabel(selected.role)}</p>
          <p>Status: {selected.status}</p>
          <p>Permissions: {selected.permissions.join(", ") || "none"}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
            <Button controlId="S16-04" type="button" variant="secondary" onClick={() => setConfirm("role")}>Change role</Button>
            <Button controlId="S16-05" type="button" variant="secondary" onClick={() => setConfirm("permissions")}>Manage permissions</Button>
            {selected.status === "ACTIVE" ? (
              <Button controlId="S16-06" type="button" variant="danger" onClick={() => setConfirm("deactivate")}>Deactivate</Button>
            ) : null}
            {selected.status === "INACTIVE" ? (
              <Button controlId="S16-07" type="button" variant="secondary" onClick={() => setConfirm("reactivate")}>Reactivate</Button>
            ) : null}
            {selected.status === "INVITED" ? (
              <>
                <Button controlId="S16-08" type="button" variant="secondary" onClick={() => void api(`/staff/${selected.id}/resend-invitation`, { method: "POST" })}>Resend invitation</Button>
                <Button controlId="S16-08" type="button" variant="danger" onClick={() => setConfirm("revoke")}>Revoke invitation</Button>
              </>
            ) : (
              <Button controlId="S16-08" type="button" disabled>Resend invitation</Button>
            )}
          </div>
          {confirm ? (
            <div>
              <Field label="Reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} error={fieldError(error, "reason")} />
              {confirm === "role" ? (
                <div className="field">
                  <label htmlFor="nextRole">New role</label>
                  <select id="nextRole" value={nextRole} onChange={(e) => setNextRole(e.target.value as StaffBusinessRole)}>
                    {ROLES.map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}
                  </select>
                </div>
              ) : null}
              {confirm === "permissions" ? (
                <div className="field">
                  <label><input type="checkbox" checked={manageStaff} onChange={(e) => setManageStaff(e.target.checked)} /> manage_staff</label>
                  <label><input type="checkbox" checked={viewAudit} onChange={(e) => setViewAudit(e.target.checked)} /> view_audit</label>
                </div>
              ) : null}
              {error ? <p className="field-error">{errorMessage(error, "Change was rejected")}</p> : null}
              <Button
                type="button"
                onClick={() => {
                  if (confirm === "role") void saveRole();
                  if (confirm === "permissions") void savePermissions();
                  if (confirm === "deactivate") void runStatus("INACTIVE");
                  if (confirm === "reactivate") void runStatus("ACTIVE");
                  if (confirm === "revoke") void runStatus("INVITATION_REVOKED");
                }}
              >
                Confirm
              </Button>
            </div>
          ) : null}
        </Dialog>
      ) : null}
    </main>
  );
}

export function ActivityLogPage() {
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  useEffect(() => {
    void api<{ items: AuditEvent[] }>("/audit-events").then((data) => setItems(data.items));
  }, []);

  return (
    <main className="staff-page">
      <div className="staff-top"><span>{aucklandDate()}</span></div>
      <h1>Activity log</h1>
      <table className="data-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Action</th>
            <th>Actor</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td className="empty-row" colSpan={3}>No audit events yet.</td></tr>
          ) : null}
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <button type="button" className="btn btn-ghost" data-control-id="S19-02" onClick={() => setSelected(item)}>
                  {item.createdAt}
                </button>
              </td>
              <td>{item.action}</td>
              <td>{item.actorName ?? "system"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected ? (
        <Dialog title={selected.action} open onClose={() => setSelected(null)}>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(selected, null, 2)}</pre>
        </Dialog>
      ) : null}
    </main>
  );
}

export function UnavailableStaffPage({ title }: { title: string }) {
  return (
    <main className="staff-page">
      <div className="staff-top"><span>{aucklandDate()}</span></div>
      <LaterModulePage title={title} />
    </main>
  );
}
