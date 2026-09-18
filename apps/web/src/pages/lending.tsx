import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button, Dialog, Field } from "@toumua/ui";
import type {
  ApplicationDetail,
  ApplicationSummary,
  BorrowerSummary,
  CursorListResponse,
} from "@toumua/contracts";
import { api, errorMessage, fieldError, uploadFile } from "../api";
import { aucklandDate } from "../format";

type BorrowerDetail = BorrowerSummary & {
  linkedUser: { id: string; name: string; email: string } | null;
  linkId: string | null;
};

const STEPS = [
  { key: "borrower", label: "Borrower", path: "borrower" },
  { key: "loan_details", label: "Loan details", path: "loan_details" },
  { key: "security", label: "Security assets", path: "security" },
  { key: "terms", label: "Repayment terms", path: "terms" },
  { key: "review", label: "Review", path: "review" },
] as const;

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function BorrowersPage() {
  const [data, setData] = useState<CursorListResponse<BorrowerSummary> | null>(null);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState<"new" | BorrowerSummary | null>(null);
  const [detail, setDetail] = useState<BorrowerDetail | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<unknown>(null);
  const navigate = useNavigate();

  async function reload(search = query) {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const response = await api<CursorListResponse<BorrowerSummary>>(`/borrowers?${params}`);
    setData(response);
  }

  useEffect(() => {
    void reload();
  }, []);

  function openNew() {
    setDrawer("new");
    setName("");
    setPhone("");
    setAddress("");
    setEmail("");
    setNotes("");
    setError(null);
  }

  function openEdit(row: BorrowerSummary) {
    setDrawer(row);
    setName(row.name);
    setPhone(row.phone);
    setAddress(row.address);
    setEmail(row.email ?? "");
    setNotes(row.notes ?? "");
    setError(null);
    void api<BorrowerDetail>(`/borrowers/${row.id}`).then(setDetail);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!drawer) return;
    const drawerId = drawer === "new" ? null : drawer.id;
    setError(null);
    try {
      const body = { name, phone, address, email, notes };
      const saved = drawerId
        ? await api<BorrowerDetail>(`/borrowers/${drawerId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : await api<BorrowerDetail>("/borrowers", { method: "POST", body: JSON.stringify(body) });
      setDrawer(null);
      await reload();
      setDetail(saved);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <main className="staff-page">
      <div className="section-head">
        <h1>Borrowers</h1>
        <Button data-control-id="S02-01" onClick={openNew}>Add borrower</Button>
      </div>
      <div className="toolbar">
        <input
          data-control-id="S02-02"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, phone, or number"
        />
        <Button variant="secondary" onClick={() => void reload()}>Search</Button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Number</th>
            <th>Name</th>
            <th>Phone</th>
            <th>Linked account</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.length ? data.items.map((row) => (
            <tr key={row.id}>
              <td>{row.number}</td>
              <td>
                <button type="button" className="linkish" data-control-id="S02-03" onClick={() => openEdit(row)}>
                  {row.name}
                </button>
              </td>
              <td>{row.phone}</td>
              <td>{row.linkedUserId ? "Linked" : "—"}</td>
              <td>{new Date(row.updatedAt).toLocaleDateString()}</td>
            </tr>
          )) : (
            <tr><td colSpan={5} className="empty-row">No borrowers match this search.</td></tr>
          )}
        </tbody>
      </table>

      <Dialog open={drawer != null} onClose={() => setDrawer(null)} title={drawer === "new" ? "Add borrower" : "Edit borrower"}>
        <form className="stack" onSubmit={(event) => void save(event)}>
          <Field label="Full name" error={fieldError(error, "name")}>
            <input value={name} onChange={(event) => setName(event.target.value)} required data-control-id="S02-04" />
          </Field>
          <Field label="Phone" error={fieldError(error, "phone")}>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} required />
          </Field>
          <Field label="Address" error={fieldError(error, "address")}>
            <textarea value={address} onChange={(event) => setAddress(event.target.value)} required />
          </Field>
          <Field label="Email" error={fieldError(error, "email")}>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          {error ? <p className="error">{errorMessage(error, "Could not save borrower")}</p> : null}
          <div className="hero-actions">
            <Button type="submit" data-control-id="S02-05">{drawer === "new" ? "Save borrower" : "Save changes"}</Button>
            {drawer && drawer !== "new" ? (
              <>
                <Button variant="secondary" type="button" onClick={() => navigate(`/staff/borrowers/${drawer.id}/account-link`)}>
                  Account link
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  data-control-id="S03-02"
                  onClick={() => void api<ApplicationDetail>("/applications", {
                    method: "POST",
                    body: JSON.stringify({ borrowerId: drawer.id }),
                  }).then((app) => navigate(`/staff/applications/${app.id}/edit/borrower`))}
                >
                  New application
                </Button>
              </>
            ) : null}
          </div>
        </form>
      </Dialog>

      {detail?.linkedUser ? (
        <p className="hint">Linked customer: {detail.linkedUser.name} ({detail.linkedUser.email})</p>
      ) : null}
    </main>
  );
}

export function AccountLinkPage() {
  const { id = "" } = useParams();
  const [borrower, setBorrower] = useState<BorrowerDetail | null>(null);
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("");
  const [confirmIdentity, setConfirmIdentity] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    void api<BorrowerDetail>(`/borrowers/${id}`).then(setBorrower);
  }, [id]);

  async function searchAccounts(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setAccounts([]);
      return;
    }
    const data = await api<{ items: Array<{ id: string; name: string; email: string }> }>(
      `/verified-accounts?q=${encodeURIComponent(value.trim())}`,
    );
    setAccounts(data.items);
  }

  async function link(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const saved = await api<BorrowerDetail>(`/borrowers/${id}/account-link`, {
        method: "POST",
        body: JSON.stringify({
          userId: selectedUserId,
          verificationMethod,
          confirmIdentity,
        }),
      });
      setBorrower(saved);
    } catch (err) {
      setError(err);
    }
  }

  async function revoke(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const saved = await api<BorrowerDetail>(`/borrowers/${id}/account-link/revoke`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setBorrower(saved);
      setReason("");
    } catch (err) {
      setError(err);
    }
  }

  if (!borrower) return <main className="staff-page"><p>Loading borrower…</p></main>;

  return (
    <main className="staff-page">
      <Link to="/staff/borrowers">← Borrowers</Link>
      <h1>Account link</h1>
      <p className="hint">{borrower.name} · {borrower.number}</p>
      {borrower.linkedUser ? (
        <section className="card">
          <h2>Active link</h2>
          <p>{borrower.linkedUser.name} · {borrower.linkedUser.email}</p>
          <form className="stack" onSubmit={(event) => void revoke(event)}>
            <Field label="Reason for revoke" error={fieldError(error, "reason")}>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} required data-control-id="S17-04" />
            </Field>
            <Button type="submit" data-control-id="S17-05">Confirm revoke</Button>
          </form>
        </section>
      ) : (
        <form className="stack card" onSubmit={(event) => void link(event)}>
          <Field label="Search verified customer account" error={fieldError(error, "userId")}>
            <input
              value={query}
              onChange={(event) => void searchAccounts(event.target.value)}
              placeholder="Name or email"
              data-control-id="S17-01"
            />
          </Field>
          {accounts.length ? (
            <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} data-control-id="S17-02">
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name} · {account.email}</option>
              ))}
            </select>
          ) : null}
          <Field label="Verification method" error={fieldError(error, "verificationMethod")}>
            <input value={verificationMethod} onChange={(event) => setVerificationMethod(event.target.value)} required />
          </Field>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmIdentity}
              onChange={(event) => setConfirmIdentity(event.target.checked)}
              data-control-id="S17-03"
            />
            I have verified this customer&apos;s identity
          </label>
          {error ? <p className="error">{errorMessage(error, "Could not link account")}</p> : null}
          <Button type="submit">Confirm link</Button>
        </form>
      )}
    </main>
  );
}

export function ApplicationsPage() {
  const [data, setData] = useState<CursorListResponse<ApplicationSummary> | null>(null);
  const [status, setStatus] = useState("ALL");
  const navigate = useNavigate();

  async function reload() {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    setData(await api<CursorListResponse<ApplicationSummary>>(`/applications?${params}`));
  }

  useEffect(() => {
    void reload();
  }, [status]);

  return (
    <main className="staff-page">
      <div className="section-head">
        <h1>Applications</h1>
        <Button
          data-control-id="S03-01"
          onClick={() => void api<ApplicationDetail>("/applications", { method: "POST", body: "{}" }).then((app) => navigate(`/staff/applications/${app.id}/edit/borrower`))}
        >
          New application
        </Button>
      </div>
      <div className="toolbar">
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ALL">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="DECLINED">Declined</option>
        </select>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Application</th>
            <th>Borrower</th>
            <th>Status</th>
            <th>Step</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.length ? data.items.map((row) => (
            <tr key={row.id}>
              <td>
                <Link to={`/staff/applications/${row.id}/edit/borrower`}>{row.number}</Link>
              </td>
              <td>{row.borrowerName ?? "—"}</td>
              <td>{statusLabel(row.status)}</td>
              <td>{statusLabel(row.currentStep)}</td>
              <td>
                {row.status === "SUBMITTED" ? (
                  <Link to={`/staff/applications/${row.id}/review`}>Review</Link>
                ) : (
                  new Date(row.updatedAt).toLocaleDateString()
                )}
              </td>
            </tr>
          )) : (
            <tr><td colSpan={5} className="empty-row">No applications yet.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

export function ApplicationWizardPage() {
  const { id = "", step: stepParam } = useParams();
  const location = useLocation();
  const step = stepParam ?? (location.pathname.endsWith("/review") ? "review" : "borrower");
  const navigate = useNavigate();
  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [borrowerQuery, setBorrowerQuery] = useState("");
  const [borrowers, setBorrowers] = useState<BorrowerSummary[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetDescription, setAssetDescription] = useState("");
  const [assetCondition, setAssetCondition] = useState("");
  const [firstPaymentDate, setFirstPaymentDate] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [periods, setPeriods] = useState("12");
  const [preview, setPreview] = useState<unknown>(null);

  async function reload() {
    const detail = await api<ApplicationDetail>(`/applications/${id}`);
    setApp(detail);
    setAmount(detail.requestedAmount ?? "");
    setPurpose(detail.purpose ?? "");
    setTermMonths(detail.proposedTermMonths ? String(detail.proposedTermMonths) : "");
    setFirstPaymentDate(detail.terms?.firstPaymentDate?.slice(0, 10) ?? "");
    setFrequency(detail.terms?.frequency ?? "MONTHLY");
    setPeriods(detail.terms?.periods ? String(detail.terms.periods) : "12");
  }

  useEffect(() => {
    void reload();
  }, [id]);

  const currentIndex = useMemo(
    () => STEPS.findIndex((item) => item.path === step),
    [step],
  );

  async function searchBorrowers(value: string) {
    setBorrowerQuery(value);
    if (value.trim().length < 1) {
      setBorrowers([]);
      return;
    }
    const data = await api<CursorListResponse<BorrowerSummary>>(`/borrowers?q=${encodeURIComponent(value.trim())}`);
    setBorrowers(data.items);
  }

  async function saveBorrower(borrowerId: string) {
    if (!app) return;
    setError(null);
    try {
      const saved = await api<ApplicationDetail>(`/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: app.version,
          borrowerId,
          currentStep: "BORROWER",
        }),
      });
      setApp(saved);
    } catch (err) {
      setError(err);
    }
  }

  async function saveLoanDetails(event: FormEvent) {
    event.preventDefault();
    if (!app) return;
    setError(null);
    try {
      const saved = await api<ApplicationDetail>(`/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: app.version,
          requestedAmount: amount,
          purpose,
          proposedTermMonths: Number.parseInt(termMonths, 10),
          currentStep: "LOAN_DETAILS",
        }),
      });
      setApp(saved);
      navigate(`/staff/applications/${id}/edit/security`);
    } catch (err) {
      setError(err);
    }
  }

  async function addAsset(event: FormEvent) {
    event.preventDefault();
    if (!app) return;
    setError(null);
    try {
      const saved = await api<ApplicationDetail>(`/applications/${id}/assets`, {
        method: "POST",
        body: JSON.stringify({
          name: assetName,
          description: assetDescription,
          condition: assetCondition,
        }),
      });
      setApp(saved);
      setAssetName("");
      setAssetDescription("");
      setAssetCondition("");
    } catch (err) {
      setError(err);
    }
  }

  async function uploadPhoto(assetId: string, file: File) {
    await uploadFile(`/applications/${id}/assets/${assetId}/photos`, file);
    await reload();
  }

  async function saveTerms(event: FormEvent) {
    event.preventDefault();
    if (!app) return;
    setError(null);
    try {
      const saved = await api<ApplicationDetail>(`/applications/${id}/terms`, {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: app.version,
          firstPaymentDate,
          frequency,
          periods: Number.parseInt(periods, 10),
        }),
      });
      setApp(saved);
    } catch (err) {
      setError(err);
    }
  }

  async function loadPreview() {
    if (!app) return;
    const data = await api<{ preview: unknown }>(`/applications/${id}/schedule-preview`, {
      method: "POST",
      body: JSON.stringify({
        expectedVersion: app.version,
        firstPaymentDate,
        frequency,
        periods: Number.parseInt(periods, 10),
      }),
    });
    setPreview(data.preview);
  }

  async function submitApplication() {
    if (!app) return;
    setError(null);
    try {
      const saved = await api<ApplicationDetail>(`/applications/${id}/submit`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: app.version }),
      });
      setApp(saved);
      navigate("/staff/applications");
    } catch (err) {
      setError(err);
    }
  }

  if (!app) return <main className="staff-page"><p>Loading application…</p></main>;

  return (
    <main className="staff-page">
      <Link to="/staff/applications">← Applications</Link>
      <h1>{app.number}</h1>
      <p className="hint">{statusLabel(app.status)} · version {app.version}</p>
      <nav className="wizard-steps">
        {STEPS.map((item, index) => (
          <Link
            key={item.key}
            className={index === currentIndex ? "active" : undefined}
            to={`/staff/applications/${id}/edit/${item.path}`}
            data-control-id={`S04-0${index + 1}`}
          >
            {index + 1}. {item.label}
          </Link>
        ))}
      </nav>

      {step === "borrower" ? (
        <section className="card stack">
          <h2>Borrower</h2>
          <input
            value={borrowerQuery}
            onChange={(event) => void searchBorrowers(event.target.value)}
            placeholder="Search borrowers"
          />
          {borrowers.map((row) => (
            <button key={row.id} type="button" className="linkish" onClick={() => void saveBorrower(row.id)}>
              {row.name} · {row.number}
            </button>
          ))}
          {app.borrowerName ? <p>Selected: {app.borrowerName}</p> : null}
        </section>
      ) : null}

      {step === "loan_details" ? (
        <form className="card stack" onSubmit={(event) => void saveLoanDetails(event)}>
          <h2>Loan details</h2>
          <Field label="Requested amount" error={fieldError(error, "requestedAmount")}>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </Field>
          <Field label="Purpose" error={fieldError(error, "purpose")}>
            <input value={purpose} onChange={(event) => setPurpose(event.target.value)} required />
          </Field>
          <Field label="Proposed term (months)" error={fieldError(error, "proposedTermMonths")}>
            <input value={termMonths} onChange={(event) => setTermMonths(event.target.value)} required type="number" min={1} />
          </Field>
          <Button type="submit">Save and continue</Button>
        </form>
      ) : null}

      {step === "security" ? (
        <section className="card stack">
          <h2>Security assets</h2>
          {app.assets.map((asset) => (
            <article key={asset.id} className="stack">
              <strong>{asset.name}</strong>
              <span>{asset.description}</span>
              <span>{asset.condition}</span>
              <span>{asset.photoCount} photo(s) · valuation {asset.valuationStatus ?? "requested"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(asset.id, file);
                }}
              />
              <Link to={`/staff/applications/${id}/valuation`}>Open valuation</Link>
            </article>
          ))}
          <form className="stack" onSubmit={(event) => void addAsset(event)}>
            <Field label="Asset name"><input value={assetName} onChange={(event) => setAssetName(event.target.value)} required /></Field>
            <Field label="Description"><textarea value={assetDescription} onChange={(event) => setAssetDescription(event.target.value)} required /></Field>
            <Field label="Condition"><input value={assetCondition} onChange={(event) => setAssetCondition(event.target.value)} required /></Field>
            <Button type="submit">Add asset</Button>
          </form>
        </section>
      ) : null}

      {step === "terms" ? (
        <form className="card stack" onSubmit={(event) => void saveTerms(event)}>
          <h2>Repayment terms</h2>
          <Field label="First payment date"><input type="date" value={firstPaymentDate} onChange={(event) => setFirstPaymentDate(event.target.value)} required /></Field>
          <Field label="Frequency">
            <select value={frequency} onChange={(event) => setFrequency(event.target.value)}>
              <option value="WEEKLY">Weekly</option>
              <option value="FORTNIGHTLY">Fortnightly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </Field>
          <Field label="Periods"><input value={periods} onChange={(event) => setPeriods(event.target.value)} type="number" min={1} required /></Field>
          {!app.terms?.policyConfigured ? <p className="hint">Production calculation policy is not configured. Test preview is available in development.</p> : null}
          <div className="hero-actions">
            <Button type="submit">Save terms</Button>
            <Button type="button" variant="secondary" onClick={() => void loadPreview()}>Preview schedule</Button>
          </div>
          {preview ? <pre>{JSON.stringify(preview, null, 2)}</pre> : null}
        </form>
      ) : null}

      {step === "review" ? (
        <section className="card stack">
          <h2>Review</h2>
          <ul>
            {app.readiness.map((item) => (
              <li key={item.id}>{item.complete ? "✓" : "○"} {item.label}</li>
            ))}
          </ul>
          {error ? <p className="error">{errorMessage(error, "Could not submit application")}</p> : null}
          <Button data-control-id="S04-06" onClick={() => void submitApplication()} disabled={app.status !== "DRAFT"}>
            Submit for review
          </Button>
        </section>
      ) : null}
    </main>
  );
}

export function ValuationPage() {
  const { id = "" } = useParams();
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [amount, setAmount] = useState("");
  const [basis, setBasis] = useState("");
  const [valuationDate, setValuationDate] = useState(aucklandDate());
  const [participatedAt, setParticipatedAt] = useState(new Date().toISOString().slice(0, 16));
  const [borrowerPresent, setBorrowerPresent] = useState(false);
  const [loanOfficerId, setLoanOfficerId] = useState("");
  const [valuationOfficerId, setValuationOfficerId] = useState("");
  const [error, setError] = useState<unknown>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void api<{ items: Array<Record<string, unknown>> }>(`/applications/${id}/valuations`).then((data) => {
      setItems(data.items);
      const first = data.items[0];
      if (first) {
        setAmount(String(first.amount ?? ""));
        setBasis(String(first.basis ?? ""));
      }
    });
  }, [id]);

  async function complete(valuationId: string, version: number) {
    setError(null);
    try {
      await api(`/valuations/${valuationId}/complete`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: version,
          amount,
          valuationDate,
          basis,
          borrowerPresent,
          loanOfficerId,
          valuationOfficerId,
          participatedAt: new Date(participatedAt).toISOString(),
        }),
      });
      navigate(`/staff/applications/${id}/edit/review`);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <main className="staff-page">
      <Link to={`/staff/applications/${id}/edit/security`}>← Security assets</Link>
      <h1>Valuation</h1>
      {items.map((item) => (
        <section key={String(item.id)} className="card stack">
          <h2>{String((item.asset as { name?: string })?.name ?? "Asset")}</h2>
          <Field label="Amount"><input value={amount} onChange={(event) => setAmount(event.target.value)} required data-control-id="S05-01" /></Field>
          <Field label="Valuation date"><input type="date" value={valuationDate} onChange={(event) => setValuationDate(event.target.value)} data-control-id="S05-02" /></Field>
          <Field label="Basis"><textarea value={basis} onChange={(event) => setBasis(event.target.value)} required data-control-id="S05-03" /></Field>
          <Field label="Loan officer ID"><input value={loanOfficerId} onChange={(event) => setLoanOfficerId(event.target.value)} required /></Field>
          <Field label="Valuation officer ID"><input value={valuationOfficerId} onChange={(event) => setValuationOfficerId(event.target.value)} required /></Field>
          <Field label="Participation time"><input type="datetime-local" value={participatedAt} onChange={(event) => setParticipatedAt(event.target.value)} data-control-id="S05-04" /></Field>
          <label className="checkbox-row"><input type="checkbox" checked={borrowerPresent} onChange={(event) => setBorrowerPresent(event.target.checked)} />Borrower present</label>
          {error ? <p className="error">{errorMessage(error, "Could not complete valuation")}</p> : null}
          <Button onClick={() => void complete(String(item.id), Number(item.version ?? 1))}>Save valuation</Button>
        </section>
      ))}
    </main>
  );
}

export function CustomerApplicationDetailPage() {
  const { id = "" } = useParams();
  const [item, setItem] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api<Record<string, unknown>>(`/me/applications/${id}`).then(setItem);
  }, [id]);

  if (!item) return <main className="page"><p>Loading application…</p></main>;

  const stages = (item.stages as Array<{ id: string; label: string; complete: boolean }>) ?? [];

  return (
    <main className="page">
      <h1 className="serif" style={{ fontSize: 40 }}>Application progress</h1>
      <p>{String(item.number)} · {statusLabel(String(item.status))}</p>
      {item.publicNote ? <p className="hint">{String(item.publicNote)}</p> : null}
      <ol className="guide" style={{ marginTop: 32 }}>
        {stages.map((stage) => (
          <li key={stage.id}>{stage.complete ? "✓" : "○"} {stage.label}</li>
        ))}
      </ol>
      <Link className="btn btn-primary" to="/help" data-control-id="C04-02">Contact our team</Link>
    </main>
  );
}
