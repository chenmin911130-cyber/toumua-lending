import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Button, Dialog, Field } from "@toumua/ui";
import type {
  ApplicationDetail,
  ApplicationSummary,
  BorrowerSummary,
  CursorListResponse,
  DocumentSummary,
} from "@toumua/contracts";
import { api, downloadFile, errorMessage, fieldError, uploadFile } from "../api";
import { CUSTOMER_SELF_APPLY } from "../features";
import { useAuth } from "../auth";
import {
  aucklandBusinessDate,
  aucklandDateTimeLocal,
  aucklandWallTimeToIso,
  businessDateFromStored,
  formatDate,
  loyaltyBadgeLabel,
  loyaltyRateLine,
} from "../format";
import { BorrowerPicker } from "../components/BorrowerPicker";

type BorrowerDetail = BorrowerSummary & {
  linkedUser: { id: string; name: string; email: string } | null;
  linkId: string | null;
  loyalty?: { tier: string; settledCount: number; discountBps: number };
};

type TermsPreview = {
  policy?: string;
  requestedAmount?: string;
  frequency?: string;
  periods?: number;
  firstPaymentDate?: string;
  installment?: string;
  total?: string;
  baseAnnualRateBps?: number;
  discountBps?: number;
  annualRateBps?: number;
  loyaltyTier?: string;
  interestSaved?: string;
  schedule?: Array<{ number: number; dueDate: string; amount: string }>;
};

const STAFF_SUBMIT_READINESS_IDS = new Set([
  "borrower",
  "loan-details",
  "security",
  "valuations",
  "terms",
]);

function staffCanSubmit(readiness: ApplicationDetail["readiness"]) {
  return readiness
    .filter((item) => STAFF_SUBMIT_READINESS_IDS.has(item.id))
    .every((item) => item.complete);
}

function TermsSchedulePreview({ preview }: { preview: TermsPreview }) {
  const schedule = preview.schedule ?? [];
  return (
    <section className="stack" style={{ marginTop: 8 }}>
      <h3 style={{ margin: "8px 0 0", fontSize: 18 }}>Schedule preview</h3>
      <dl className="detail-list">
        <dt>Loan amount</dt>
        <dd>${preview.requestedAmount ?? "—"}</dd>
        <dt>Repayment</dt>
        <dd>
          ${preview.installment ?? "—"} {preview.frequency ? statusLabel(preview.frequency).toLowerCase() : ""}
          {preview.periods ? ` · ${preview.periods} periods` : ""}
        </dd>
        <dt>Total repayable</dt>
        <dd>${preview.total ?? "—"}</dd>
        <dt>First payment</dt>
        <dd>{preview.firstPaymentDate ? formatDate(preview.firstPaymentDate) : "—"}</dd>
        {preview.baseAnnualRateBps != null && preview.annualRateBps != null ? (
          <>
            <dt>Annual rate</dt>
            <dd>
              {loyaltyRateLine(
                preview.baseAnnualRateBps,
                preview.discountBps ?? 0,
                preview.annualRateBps,
              )}
            </dd>
          </>
        ) : null}
        {preview.loyaltyTier ? (
          <>
            <dt>Loyalty tier</dt>
            <dd>{loyaltyBadgeLabel(preview.loyaltyTier)}</dd>
          </>
        ) : null}
      </dl>
      {schedule.length ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Due date</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row) => (
              <tr key={row.number}>
                <td>{row.number}</td>
                <td>{formatDate(businessDateFromStored(row.dueDate))}</td>
                <td>${row.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="hint">No instalments in this preview.</p>
      )}
    </section>
  );
}

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
  const [smsOptIn, setSmsOptIn] = useState(true);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [error, setError] = useState<unknown>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

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
    setSmsOptIn(true);
    setError(null);
  }

  function openEdit(row: BorrowerSummary) {
    setDrawer(row);
    setName(row.name);
    setPhone(row.phone);
    setAddress(row.address);
    setEmail(row.email ?? "");
    setNotes(row.notes ?? "");
    setSmsOptIn(row.smsOptIn);
    setError(null);
    void api<BorrowerDetail>(`/borrowers/${row.id}`).then(setDetail);
    void api<{ items: DocumentSummary[] }>(`/borrowers/${row.id}/documents`)
      .then((response) => setDocuments(response.items))
      .catch(() => setDocuments([]));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!drawer) return;
    const drawerId = drawer === "new" ? null : drawer.id;
    setError(null);
    try {
      const body = { name, phone, address, email, notes, smsOptIn };
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
              <td>
                {row.linkedUserId ? (
                  <Link to={`/staff/borrowers/${row.id}/account-link`} data-control-id="S17-06">
                    Linked
                  </Link>
                ) : (
                  <Link to={`/staff/borrowers/${row.id}/account-link`} className="muted-link" data-control-id="S17-06">
                    Link account
                  </Link>
                )}
              </td>
              <td>{new Date(row.updatedAt).toLocaleDateString()}</td>
            </tr>
          )) : (
            <tr><td colSpan={5} className="empty-row">No borrowers match this search.</td></tr>
          )}
        </tbody>
      </table>

      <Dialog open={drawer != null} onClose={() => setDrawer(null)} title={drawer === "new" ? "Add borrower" : "Edit borrower"}>
        <form className="stack" onSubmit={(event) => void save(event)}>
          {detail?.loyalty ? (
            <p className="hint">Loyalty: {loyaltyBadgeLabel(detail.loyalty.tier)}</p>
          ) : null}
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
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={smsOptIn}
              onChange={(event) => setSmsOptIn(event.target.checked)}
            />
            Send SMS repayment reminders
          </label>
          {drawer && drawer !== "new" ? (
            <section>
              <h3>Documents</h3>
              <ul>
                {documents.map((document) => (
                  <li key={document.id}>
                    {document.filename} · {document.sha256.slice(0, 12)}
                    <Button type="button" variant="secondary" onClick={() => void downloadFile(`/documents/${document.id}/file`, document.filename)}>
                      Download
                    </Button>
                    {user?.role === "MANAGER" ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          void api(`/documents/${document.id}`, { method: "DELETE" }).then(() =>
                            setDocuments((current) => current.filter((row) => row.id !== document.id)),
                          );
                        }}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void uploadFile<DocumentSummary>(`/borrowers/${drawer.id}/documents`, file).then((saved) =>
                    setDocuments((current) => [saved, ...current]),
                  );
                }}
              />
            </section>
          ) : null}
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
  const { user } = useAuth();
  const [data, setData] = useState<CursorListResponse<ApplicationSummary> | null>(null);
  const [status, setStatus] = useState("ALL");
  const [error, setError] = useState<unknown>(null);
  const navigate = useNavigate();
  const isValuer = user?.role === "VALUATION_OFFICER";

  async function reload() {
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    setError(null);
    try {
      setData(await api<CursorListResponse<ApplicationSummary>>(`/applications?${params}`));
    } catch (err) {
      setError(err);
      setData(null);
    }
  }

  useEffect(() => {
    if (isValuer) return;
    void reload();
  }, [status, isValuer]);

  if (isValuer) {
    return (
      <main className="staff-page">
        <h1>Applications</h1>
        <p className="hint">
          Valuation officers work from the valuation queue, not the full applications list.{" "}
          <Link className="btn btn-primary" to="/staff/valuations">Open valuation queue</Link>
        </p>
      </main>
    );
  }

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
      {error ? <p className="error">{errorMessage(error, "Could not load applications")}</p> : null}
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
                <Link to={`/staff/applications/${row.id}/edit/review`}>Open</Link>
                {row.status === "SUBMITTED" ? (
                  <>
                    {" · "}
                    <Link to={`/staff/applications/${row.id}/review`}>Review</Link>
                  </>
                ) : (
                  <> · {new Date(row.updatedAt).toLocaleDateString()}</>
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
  const [pickedBorrower, setPickedBorrower] = useState<BorrowerSummary | null>(null);
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
  const [preview, setPreview] = useState<TermsPreview | null>(null);
  const [uploadingAssetId, setUploadingAssetId] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState("");
  const { user: staffUser } = useAuth();
  const [valuationAmount, setValuationAmount] = useState("");
  const [valuationBasis, setValuationBasis] = useState("In-person inspection for loan security");
  const [valuationBorrowerPresent, setValuationBorrowerPresent] = useState(true);
  const [savingValuationAssetId, setSavingValuationAssetId] = useState<string | null>(null);
  const [valuationsByAsset, setValuationsByAsset] = useState<
    Record<string, { id: string; version: number; status: string }>
  >({});

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

  useEffect(() => {
    if (step === "review") void reload();
  }, [step, id]);

  useEffect(() => {
    if (step !== "security" || !id) return;
    void api<{
      items: Array<{ id: string; assetId: string; version: number; status: string }>;
    }>(`/applications/${id}/valuations`)
      .then((data) => {
        const map: Record<string, { id: string; version: number; status: string }> = {};
        for (const row of data.items) {
          map[row.assetId] = { id: row.id, version: row.version, status: row.status };
        }
        setValuationsByAsset(map);
      })
      .catch(() => setValuationsByAsset({}));
  }, [step, id, app?.assets.length]);

  useEffect(() => {
    if (app?.requestedAmount && !valuationAmount) {
      setValuationAmount(app.requestedAmount);
    }
  }, [app?.requestedAmount, valuationAmount]);

  useEffect(() => {
    if (!app?.borrowerId) {
      setPickedBorrower(null);
      return;
    }
    if (pickedBorrower?.id === app.borrowerId) return;
    void api<BorrowerDetail>(`/borrowers/${app.borrowerId}`).then(setPickedBorrower);
  }, [app?.borrowerId, pickedBorrower?.id]);

  const currentIndex = useMemo(
    () => STEPS.findIndex((item) => item.path === step),
    [step],
  );

  async function saveBorrower(row: BorrowerSummary) {
    if (!app) return;
    setError(null);
    try {
      const saved = await api<ApplicationDetail>(`/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: app.version,
          borrowerId: row.id,
          currentStep: "BORROWER",
        }),
      });
      setApp(saved);
      setPickedBorrower(row);
    } catch (err) {
      setError(err);
    }
  }

  async function clearBorrower() {
    if (!app) return;
    setError(null);
    try {
      const saved = await api<ApplicationDetail>(`/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: app.version,
          borrowerId: null,
          currentStep: "BORROWER",
        }),
      });
      setApp(saved);
      setPickedBorrower(null);
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

  async function completeAssetValuation(assetId: string, valuationId: string, version: number) {
    if (!app) return;
    setSavingValuationAssetId(assetId);
    setError(null);
    try {
      const participants = await api<{
        loanOfficers: Array<{ id: string }>;
        valuationOfficers: Array<{ id: string }>;
      }>(`/applications/${id}/valuations`);
      const loanOfficerId =
        staffUser?.role === "LOAN_OFFICER"
          ? staffUser.id
          : participants.loanOfficers[0]?.id ?? "";
      const valuationOfficerId = participants.valuationOfficers[0]?.id ?? "";
      if (!loanOfficerId || !valuationOfficerId) {
        throw new Error("Demo loan and valuation officers are missing. Run pnpm seed:demo.");
      }
      await api(`/valuations/${valuationId}/complete`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: version,
          amount: valuationAmount,
          valuationDate: aucklandBusinessDate(),
          basis: valuationBasis,
          borrowerPresent: valuationBorrowerPresent,
          loanOfficerId,
          valuationOfficerId,
          participatedAt: aucklandWallTimeToIso(aucklandDateTimeLocal()),
        }),
      });
      await reload();
      setPhotoMessage("Valuation saved for this asset.");
    } catch (err) {
      setError(err);
    } finally {
      setSavingValuationAssetId(null);
    }
  }

  async function uploadPhoto(assetId: string, file: File) {
    if (file.size > 8 * 1024 * 1024) {
      setError(new Error("Photo must be under 8 MB"));
      return;
    }
    setUploadingAssetId(assetId);
    setPhotoMessage("");
    setError(null);
    try {
      await uploadFile(`/applications/${id}/assets/${assetId}/photos`, file);
      await reload();
      setPhotoMessage(`Photo added for this asset (${file.name}).`);
    } catch (err) {
      setError(err);
    } finally {
      setUploadingAssetId(null);
    }
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
    setPreview(data.preview as TermsPreview);
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
      {app.status === "SUBMITTED" ? (
        <p className="hint">
          Customer submitted this application. Complete valuation and repayment terms, then a manager can decide.
          {" "}
          <Link to={`/staff/applications/${id}/review`}>Open manager review</Link>
        </p>
      ) : null}
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
          <p className="hint">
            Pick a borrower whose login is linked under Borrowers → Link account, so they can see this application after you submit it.
          </p>
          {error ? <p className="error" role="alert">{errorMessage(error, "Could not update borrower")}</p> : null}
          <BorrowerPicker
            selected={app.borrowerId && pickedBorrower ? pickedBorrower : null}
            borrowerIdForLink={app.borrowerId}
            onPick={(row) => saveBorrower(row)}
            onClear={() => clearBorrower()}
          />
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
          <p className="hint">Add at least one photo per asset before you submit. JPG, PNG, or WebP, up to 8 MB each.</p>
          {error ? <p className="error" role="alert">{errorMessage(error, "Could not update security assets")}</p> : null}
          {photoMessage ? <p className="hint" role="status">{photoMessage}</p> : null}
          {app.assets.map((asset) => {
            const linkedValuation = valuationsByAsset[asset.id];
            const valuationId = asset.valuationId ?? linkedValuation?.id ?? null;
            const valuationVersion = asset.valuationVersion ?? linkedValuation?.version ?? null;
            const valuationStatus = asset.valuationStatus ?? linkedValuation?.status ?? null;
            return (
            <article key={asset.id} className="stack">
              <strong>{asset.name}</strong>
              <span>{asset.description}</span>
              <span>{asset.condition}</span>
              <span>{asset.photoCount} photo(s) · valuation {valuationStatus ?? "requested"}</span>
              {asset.photos?.length ? (
                <ul className="photo-grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {asset.photos.map((photo) => (
                    <li key={photo.id}>
                      <img src={photo.url} alt={`${asset.name} photo`} loading="lazy" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">No photos yet.</p>
              )}
              <Field label={uploadingAssetId === asset.id ? "Uploading photo…" : "Add photo"}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadingAssetId === asset.id}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadPhoto(asset.id, file);
                  }}
                />
              </Field>
              {valuationStatus === "COMPLETED" ? (
                <p className="hint">
                  Valuation recorded{asset.valuationAmount ? ` · $${asset.valuationAmount}` : ""}.
                </p>
              ) : valuationId && valuationVersion ? (
                <div className="stack">
                  <p className="hint">Record a valuation so Review can tick security checks.</p>
                  <Field label="Security value (NZD)">
                    <input
                      value={valuationAmount}
                      onChange={(event) => setValuationAmount(event.target.value)}
                      placeholder={app.requestedAmount ? `At least ${app.requestedAmount}` : "e.g. 2500"}
                      required
                    />
                  </Field>
                  <Field label="Basis">
                    <textarea
                      value={valuationBasis}
                      onChange={(event) => setValuationBasis(event.target.value)}
                      required
                    />
                  </Field>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={valuationBorrowerPresent}
                      onChange={(event) => setValuationBorrowerPresent(event.target.checked)}
                    />
                    Borrower present at inspection
                  </label>
                  <div className="hero-actions">
                    <Button
                      type="button"
                      disabled={savingValuationAssetId === asset.id}
                      onClick={() =>
                        void completeAssetValuation(asset.id, valuationId, valuationVersion)
                      }
                    >
                      {savingValuationAssetId === asset.id ? "Saving valuation…" : "Save valuation"}
                    </Button>
                    <Link
                      className="btn btn-secondary"
                      to={`/staff/applications/${id}/valuation`}
                    >
                      Open full valuation form
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="hint">
                  Loading valuation record…{" "}
                  <button type="button" className="linkish" onClick={() => void reload()}>
                    Retry
                  </button>
                </p>
              )}
            </article>
          );
          })}
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
          <p className="hint">
            {app.terms?.policyConfigured
              ? "Repayment schedule preview. Confirm rates with the office formula."
              : "Calculation policy is switched off. Approvals stay blocked until an official policy is enabled."}
          </p>
          {app.terms?.loyaltyTier ? (
            <p className="hint">Loyalty: {loyaltyBadgeLabel(app.terms.loyaltyTier)}</p>
          ) : null}
          {preview?.loyaltyTier ? (
            <p className="hint">Preview loyalty: {loyaltyBadgeLabel(preview.loyaltyTier)}</p>
          ) : null}
          {preview?.interestSaved && preview.interestSaved !== "0.00" ? (
            <p className="hint">Saves ${preview.interestSaved} interest on this loan</p>
          ) : null}
          <p className="hint">Demo rates, subject to client confirmation</p>
          <div className="hero-actions">
            <Button type="submit">Save terms</Button>
            <Button type="button" variant="secondary" onClick={() => void loadPreview()}>Preview schedule</Button>
          </div>
          {preview ? <TermsSchedulePreview preview={preview} /> : null}
        </form>
      ) : null}

      {step === "review" ? (
        <section className="card stack">
          <h2>Review</h2>
          <ul className="readiness-list">
            {app.readiness.map((item) => (
              <li key={item.id} className={item.complete ? "readiness-done" : "readiness-pending"}>
                {item.complete ? "✓" : "○"}{" "}
                {!item.complete && item.href ? (
                  <Link to={item.href}>{item.label}</Link>
                ) : (
                  item.label
                )}
              </li>
            ))}
          </ul>
          {app.assets.length ? (
            <div className="stack">
              <h3 style={{ margin: "8px 0 0", fontSize: 16 }}>Security checklist (step 3)</h3>
              <ul>
                {app.assets.map((asset) => {
                  const photosOk = asset.photoCount > 0;
                  const valuedOk = asset.valuationStatus === "COMPLETED";
                  return (
                    <li key={asset.id}>
                      <strong>{asset.name}</strong>
                      {" — "}
                      {photosOk ? "✓ photo" : "○ add photo"}
                      {" · "}
                      {valuedOk
                        ? `✓ valued${asset.valuationAmount ? ` ($${asset.valuationAmount})` : ""}`
                        : "○ save valuation"}
                      {!photosOk || !valuedOk ? (
                        <>
                          {" "}
                          <Link to={`/staff/applications/${id}/edit/security`}>Fix on security</Link>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {app.requestedAmount ? (
                <p className="hint">
                  Loan amount ${app.requestedAmount}. Total security value must be at least that much after every asset is valued.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="hint">
              No security assets yet.{" "}
              <Link to={`/staff/applications/${id}/edit/security`}>Add an asset on step 3</Link>.
            </p>
          )}
          {!staffCanSubmit(app.readiness) ? (
            <p className="hint">
              Submit stays blocked until every asset has a photo and a completed valuation (step 3).
            </p>
          ) : null}
          {error ? <p className="error">{errorMessage(error, "Could not submit application")}</p> : null}
          <Button
            data-control-id="S04-06"
            onClick={() => void submitApplication()}
            disabled={app.status !== "DRAFT" || !staffCanSubmit(app.readiness)}
          >
            Submit for review
          </Button>
        </section>
      ) : null}
    </main>
  );
}

type ValuationListRow = {
  id: string;
  asset?: { name?: string };
  amount?: string | null;
  basis?: string | null;
  version?: number;
};

type StaffPick = { id: string; name: string; email: string };

type ValuationQueueItem = {
  id: string;
  applicationId: string;
  applicationNumber: string;
  applicationStatus: string;
  borrowerName: string | null;
  assetName: string;
  status: string;
  updatedAt: string;
};

export function ValuationQueuePage() {
  const [items, setItems] = useState<ValuationQueueItem[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<{ items: ValuationQueueItem[] }>("/valuations/queue")
      .then((data) => {
        setItems(data.items);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err);
        setItems([]);
        setLoading(false);
      });
  }, []);

  return (
    <main className="staff-page">
      <h1>Valuation queue</h1>
      <p className="hint">
        Open an application to record security values. Loan officers create drafts; valuation officers complete them here.
      </p>
      {loading ? <p className="hint">Loading queue…</p> : null}
      {error ? (
        <p className="error">
          {errorMessage(error, "Could not load valuation queue")}
          {" "}
          If you just updated the project, restart <code>pnpm dev:api</code> so <code>/valuations/queue</code> is available.
        </p>
      ) : null}
      {!loading && !error ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Application</th>
              <th>Borrower</th>
              <th>Asset</th>
              <th>Status</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length ? items.map((row) => (
              <tr key={row.id}>
                <td>{row.applicationNumber}</td>
                <td>{row.borrowerName ?? "—"}</td>
                <td>{row.assetName}</td>
                <td>{statusLabel(row.status)}</td>
                <td>{formatDate(businessDateFromStored(row.updatedAt.slice(0, 10)))}</td>
                <td>
                  <Link
                    className="btn btn-secondary"
                    to={`/staff/applications/${row.applicationId}/valuation`}
                  >
                    Open valuation
                  </Link>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={6} className="empty-row">
                  No pending valuations. When a loan officer adds security on a draft application, it will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ) : null}
    </main>
  );
}

export function ValuationPage() {
  const { id = "" } = useParams();
  const { user: staffUser } = useAuth();
  const [items, setItems] = useState<ValuationListRow[]>([]);
  const [loanOfficers, setLoanOfficers] = useState<StaffPick[]>([]);
  const [valuationOfficers, setValuationOfficers] = useState<StaffPick[]>([]);
  const [amount, setAmount] = useState("");
  const [basis, setBasis] = useState("In-person inspection for loan security");
  const [valuationDate, setValuationDate] = useState(() => aucklandBusinessDate());
  const [participatedAt, setParticipatedAt] = useState(() => aucklandDateTimeLocal());
  const [borrowerPresent, setBorrowerPresent] = useState(true);
  const [loanOfficerId, setLoanOfficerId] = useState("");
  const [valuationOfficerId, setValuationOfficerId] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void api<{
      items: ValuationListRow[];
      loanOfficers?: StaffPick[];
      valuationOfficers?: StaffPick[];
    }>(`/applications/${id}/valuations`)
      .then((data) => {
        if (!active) return;
        setItems(data.items ?? []);
        const officers = data.loanOfficers ?? [];
        const valuers = data.valuationOfficers ?? [];
        setLoanOfficers(officers);
        setValuationOfficers(valuers);
        const first = data.items?.[0];
        if (first) {
          setAmount(String(first.amount ?? ""));
          if (first.basis) setBasis(String(first.basis));
        }
        const defaultLoan =
          staffUser?.role === "LOAN_OFFICER"
            ? staffUser.id
            : officers[0]?.id ?? "";
        setLoanOfficerId(defaultLoan);
        setValuationOfficerId(valuers[0]?.id ?? "");
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err);
        setItems([]);
        setLoanOfficers([]);
        setValuationOfficers([]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, staffUser?.id, staffUser?.role]);

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
          participatedAt: aucklandWallTimeToIso(participatedAt),
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
      {loading ? <p className="hint">Loading valuations…</p> : null}
      {error ? <p className="error">{errorMessage(error, "Could not load valuations")}</p> : null}
      {!loading && items.length === 0 ? (
        <p className="hint">
          No valuation records yet.{" "}
          <Link to={`/staff/applications/${id}/edit/security`}>Add a security asset first</Link>.
        </p>
      ) : null}
      {!loading ? items.map((item) => (
        <section key={item.id} className="card stack">
          <h2>{item.asset?.name ?? "Asset"}</h2>
          <Field label="Amount"><input value={amount} onChange={(event) => setAmount(event.target.value)} required data-control-id="S05-01" /></Field>
          <Field label="Valuation date"><input type="date" value={valuationDate} onChange={(event) => setValuationDate(event.target.value)} data-control-id="S05-02" /></Field>
          <Field label="Basis"><textarea value={basis} onChange={(event) => setBasis(event.target.value)} required data-control-id="S05-03" /></Field>
          <Field label="Loan officer">
            <select value={loanOfficerId} onChange={(event) => setLoanOfficerId(event.target.value)} required>
              <option value="">Select loan officer</option>
              {loanOfficers.map((row) => (
                <option key={row.id} value={row.id}>{row.name} · {row.email}</option>
              ))}
            </select>
          </Field>
          <Field label="Valuation officer">
            <select value={valuationOfficerId} onChange={(event) => setValuationOfficerId(event.target.value)} required>
              <option value="">Select valuation officer</option>
              {valuationOfficers.map((row) => (
                <option key={row.id} value={row.id}>{row.name} · {row.email}</option>
              ))}
            </select>
          </Field>
          <Field label="Participation time"><input type="datetime-local" value={participatedAt} onChange={(event) => setParticipatedAt(event.target.value)} data-control-id="S05-04" /></Field>
          <label className="checkbox-row"><input type="checkbox" checked={borrowerPresent} onChange={(event) => setBorrowerPresent(event.target.checked)} />Borrower present</label>
          {error ? <p className="error">{errorMessage(error, "Could not complete valuation")}</p> : null}
          <Button onClick={() => void complete(item.id, Number(item.version ?? 1))}>Save valuation</Button>
        </section>
      )) : null}
    </main>
  );
}

export function CustomerApplicationDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setItem(null);
    void api<Record<string, unknown>>(`/me/applications/${id}`)
      .then((data) => {
        if (!active) return;
        if (data.status === "DRAFT" && CUSTOMER_SELF_APPLY) {
          navigate("/customer/apply", { replace: true });
          return;
        }
        setItem(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, navigate]);

  if (loading && !error) return <main className="page"><p>Loading application…</p></main>;
  if (error || !item) {
    return (
      <main className="page">
        <p className="error">{errorMessage(error, "Could not load application")}</p>
        <Link className="btn btn-secondary" to="/customer/applications">Back to applications</Link>
      </main>
    );
  }

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
