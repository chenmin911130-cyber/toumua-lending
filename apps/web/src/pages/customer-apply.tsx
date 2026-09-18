import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Field } from "@toumua/ui";
import type { ApplicationDetail } from "@toumua/contracts";
import { api, errorMessage, fieldError, uploadFile } from "../api";
import { useAuth } from "../auth";

type CustomerApplication = ApplicationDetail & {
  borrower: { id: string; name: string; phone: string; address: string; email: string | null } | null;
};

type Step = "details" | "loan" | "security" | "review";

const STEPS: Array<{ key: Step; label: string }> = [
  { key: "details", label: "Your details" },
  { key: "loan", label: "Loan" },
  { key: "security", label: "Security" },
  { key: "review", label: "Submit" },
];

const PURPOSES = [
  "Vehicle repair",
  "School fees",
  "Medical costs",
  "Home or family",
  "Business cash flow",
  "Other",
];

export function CustomerApplyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("details");
  const [app, setApp] = useState<CustomerApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");

  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [purposeDescription, setPurposeDescription] = useState("");
  const [termMonths, setTermMonths] = useState("12");

  const [assetName, setAssetName] = useState("");
  const [assetCategory, setAssetCategory] = useState("Jewellery");
  const [assetDescription, setAssetDescription] = useState("");
  const [assetCondition, setAssetCondition] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const list = await api<{ items: Array<{ id: string; status: string }> }>("/me/applications");
        const draft = list.items.find((item) => item.status === "DRAFT");
        if (draft) {
          const detail = await api<CustomerApplication>(`/me/applications/${draft.id}`);
          applyDetail(detail);
          return;
        }
        const profile = await api<{ borrower: CustomerApplication["borrower"] }>("/me/borrower");
        if (profile.borrower) {
          setName(profile.borrower.name);
          setPhone(profile.borrower.phone);
          setAddress(profile.borrower.address);
          setEmail(profile.borrower.email ?? user?.email ?? "");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.email]);

  function applyDetail(detail: CustomerApplication) {
    setApp(detail);
    if (detail.borrower) {
      setName(detail.borrower.name);
      setPhone(detail.borrower.phone);
      setAddress(detail.borrower.address);
      setEmail(detail.borrower.email ?? user?.email ?? "");
    }
    setAmount(detail.requestedAmount ?? "");
    setPurpose(detail.purpose ?? "");
    setPurposeDescription(detail.purposeDescription ?? "");
    setTermMonths(detail.proposedTermMonths ? String(detail.proposedTermMonths) : "12");
    if (detail.status !== "DRAFT") {
      navigate(`/customer/applications/${detail.id}`, { replace: true });
    }
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await api<CustomerApplication>("/me/applications", {
        method: "POST",
        body: JSON.stringify({ name, phone, address, email }),
      });
      applyDetail(created);
      setStep("loan");
    } catch (err) {
      setError(err);
    }
  }

  async function saveLoan(event: FormEvent) {
    event.preventDefault();
    if (!app) return;
    setError(null);
    try {
      const saved = await api<CustomerApplication>(`/me/applications/${app.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: app.version,
          requestedAmount: amount,
          purpose,
          purposeDescription: purposeDescription || null,
          proposedTermMonths: Number.parseInt(termMonths, 10),
          currentStep: "LOAN_DETAILS",
        }),
      });
      applyDetail(saved);
      setStep("security");
    } catch (err) {
      setError(err);
    }
  }

  async function addAsset(event: FormEvent) {
    event.preventDefault();
    if (!app) return;
    setError(null);
    try {
      const saved = await api<CustomerApplication>(`/me/applications/${app.id}/assets`, {
        method: "POST",
        body: JSON.stringify({
          name: assetName,
          category: assetCategory,
          description: assetDescription,
          condition: assetCondition,
        }),
      });
      applyDetail(saved);
      setAssetName("");
      setAssetDescription("");
      setAssetCondition("");
    } catch (err) {
      setError(err);
    }
  }

  async function uploadPhoto(assetId: string, file: File) {
    if (!app) return;
    setError(null);
    try {
      await uploadFile(`/applications/${app.id}/assets/${assetId}/photos`, file);
      applyDetail(await api<CustomerApplication>(`/me/applications/${app.id}`));
    } catch (err) {
      setError(err);
    }
  }

  async function removeAsset(assetId: string) {
    if (!app) return;
    setError(null);
    try {
      applyDetail(await api<CustomerApplication>(`/me/applications/${app.id}/assets/${assetId}`, {
        method: "DELETE",
      }));
    } catch (err) {
      setError(err);
    }
  }

  async function submitApplication() {
    if (!app) return;
    setError(null);
    try {
      const saved = await api<CustomerApplication>(`/me/applications/${app.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ expectedVersion: app.version }),
      });
      navigate(`/customer/applications/${saved.id}`);
    } catch (err) {
      setError(err);
    }
  }

  if (loading) return <main className="page"><p>Loading application…</p></main>;

  const securityReady =
    Boolean(app?.assets.length) &&
    (app?.assets.every((asset) => asset.photoCount > 0) ?? false);

  return (
    <main className="page">
      <Link to="/customer/applications">← Applications</Link>
      <h1 className="serif" style={{ fontSize: 40, marginTop: 16 }}>Apply for a loan</h1>
      <p className="hint" style={{ marginTop: 0, maxWidth: 640 }}>
        Tell us what you need and what you can offer as security. Staff will review the application and value the collateral before a manager decides.
      </p>

      <nav className="wizard-steps" style={{ margin: "28px 0" }}>
        {STEPS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className={item.key === step ? "active" : undefined}
            onClick={() => {
              if (item.key === "details" || app) setStep(item.key);
            }}
          >
            {index + 1}. {item.label}
          </button>
        ))}
      </nav>

      {step === "details" ? (
        <form className="card stack" style={{ maxWidth: 640 }} onSubmit={(event) => void saveDetails(event)}>
          <h2>Your details</h2>
          <Field label="Full name" error={fieldError(error, "name")}>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Phone" error={fieldError(error, "phone")}>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} required />
          </Field>
          <Field label="Address" error={fieldError(error, "address")}>
            <textarea value={address} onChange={(event) => setAddress(event.target.value)} required />
          </Field>
          <Field label="Email" error={fieldError(error, "email")}>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          {error ? <p className="error">{errorMessage(error, "Could not save your details")}</p> : null}
          <Button type="submit">Continue</Button>
        </form>
      ) : null}

      {step === "loan" ? (
        <form className="card stack" style={{ maxWidth: 640 }} onSubmit={(event) => void saveLoan(event)}>
          <h2>Loan details</h2>
          <Field label="Amount needed (NZD)" error={fieldError(error, "requestedAmount")}>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} required placeholder="1500.00" />
          </Field>
          <Field label="Purpose" error={fieldError(error, "purpose")}>
            <select value={purpose} onChange={(event) => setPurpose(event.target.value)} required>
              <option value="">Select a purpose</option>
              {PURPOSES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="More detail (optional)">
            <textarea value={purposeDescription} onChange={(event) => setPurposeDescription(event.target.value)} />
          </Field>
          <Field label="Proposed term (months)" error={fieldError(error, "proposedTermMonths")}>
            <input type="number" min={1} value={termMonths} onChange={(event) => setTermMonths(event.target.value)} required />
          </Field>
          {error ? <p className="error">{errorMessage(error, "Could not save loan details")}</p> : null}
          <div className="hero-actions">
            <Button type="button" variant="secondary" onClick={() => setStep("details")}>Back</Button>
            <Button type="submit">Continue</Button>
          </div>
        </form>
      ) : null}

      {step === "security" ? (
        <section className="stack" style={{ maxWidth: 720 }}>
          <div className="card stack">
            <h2>Security assets</h2>
            <p className="hint">Add the items you can pledge. A photo of each item is required so staff can start the review.</p>
            {app?.assets.map((asset) => (
              <article key={asset.id} className="stack">
                <strong>{asset.name}</strong>
                <span>{asset.category ? `${asset.category} · ` : ""}{asset.condition}</span>
                <span>{asset.description}</span>
                <span>{asset.photoCount} photo(s)</span>
                <div className="hero-actions">
                  {asset.photos.map((photo) => (
                    <img
                      key={photo.id}
                      src={photo.url}
                      alt=""
                      style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }}
                    />
                  ))}
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadPhoto(asset.id, file);
                  }}
                />
                <button type="button" className="linkish" onClick={() => void removeAsset(asset.id)}>
                  Remove asset
                </button>
              </article>
            ))}
          </div>
          <form className="card stack" onSubmit={(event) => void addAsset(event)}>
            <h3>Add an asset</h3>
            <Field label="What is it?">
              <input value={assetName} onChange={(event) => setAssetName(event.target.value)} required placeholder="Gold chain" />
            </Field>
            <Field label="Category">
              <select value={assetCategory} onChange={(event) => setAssetCategory(event.target.value)}>
                {["Jewellery", "Gold", "Electronics", "Vehicle", "Tools", "Other"].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Description">
              <textarea value={assetDescription} onChange={(event) => setAssetDescription(event.target.value)} required />
            </Field>
            <Field label="Condition">
              <input value={assetCondition} onChange={(event) => setAssetCondition(event.target.value)} required placeholder="Good, light wear" />
            </Field>
            {error ? <p className="error">{errorMessage(error, "Could not add the asset")}</p> : null}
            <Button type="submit">Add asset</Button>
          </form>
          <div className="hero-actions">
            <Button type="button" variant="secondary" onClick={() => setStep("loan")}>Back</Button>
            <Button type="button" onClick={() => setStep("review")} disabled={!securityReady}>
              Review and submit
            </Button>
          </div>
        </section>
      ) : null}

      {step === "review" ? (
        <section className="card stack" style={{ maxWidth: 640 }}>
          <h2>Review</h2>
          <p><strong>{name}</strong> · {phone}</p>
          <p className="hint">{address}</p>
          <p>Requested ${amount} for {purpose} over {termMonths} months.</p>
          <ul>
            {app?.assets.map((asset) => (
              <li key={asset.id}>{asset.name} · {asset.photoCount} photo(s)</li>
            ))}
          </ul>
          <p className="hint">Staff will value the security and set repayment terms. A manager then approves or declines.</p>
          {error ? <p className="error">{errorMessage(error, "Could not submit the application")}</p> : null}
          <div className="hero-actions">
            <Button type="button" variant="secondary" onClick={() => setStep("security")}>Back</Button>
            <Button type="button" onClick={() => void submitApplication()} disabled={!securityReady}>
              Submit application
            </Button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
