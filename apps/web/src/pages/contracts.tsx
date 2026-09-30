import { FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Field } from "@toumua/ui";
import type { LoanContractSummary } from "@toumua/contracts";
import { api, downloadFile, errorMessage } from "../api";
import { useAuth } from "../auth";
import { formatDateTime } from "../format";

type ContractView = LoanContractSummary & { bodyHtml: string };

function useScrollReady() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  function onScroll() {
    const node = ref.current;
    if (!node) return;
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - 8) setReady(true);
  }
  return { ref, ready, onScroll };
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#142033";
    context.lineWidth = 2;
    context.lineCap = "round";
  }, []);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  }

  function end() {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = false;
    for (let index = 0; index < pixels.length; index += 16) {
      if (pixels[index] < 250 || pixels[index + 1] < 250 || pixels[index + 2] < 250) {
        ink = true;
        break;
      }
    }
    onChange(ink ? canvas.toDataURL("image/png") : null);
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={560}
        height={160}
        style={{ width: "100%", maxWidth: 560, height: 160, border: "1px solid #c9d2de", borderRadius: 8, touchAction: "none", background: "#fff" }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <Button type="button" variant="secondary" onClick={clear}>Clear</Button>
    </div>
  );
}

export function CustomerContractPage() {
  const { id = "" } = useParams();
  const [contract, setContract] = useState<ContractView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [done, setDone] = useState<ContractView | null>(null);
  const scroll = useScrollReady();

  useEffect(() => {
    void api<ContractView>(`/me/contracts/${id}`).then(setContract).catch(setError);
  }, [id]);

  async function sign(event: FormEvent) {
    event.preventDefault();
    if (!contract || !signature) return;
    try {
      const saved = await api<ContractView>(`/me/contracts/${id}/sign`, {
        method: "POST",
        body: JSON.stringify({
          typedName: name,
          signaturePng: signature,
          consent: true,
          contentSha256: contract.contentSha256,
        }),
      });
      setDone(saved);
    } catch (caught) {
      setError(caught);
    }
  }

  if (error && !contract) {
    return <main className="page"><p className="error">{errorMessage(error, "Could not load contract")}</p></main>;
  }
  if (!contract) return <main className="page"><p>Loading contract…</p></main>;

  return (
    <main className="page">
      <Link to="/customer/loans">← My loans</Link>
      <h1>Loan contract {contract.number}</h1>
      <div
        ref={scroll.ref}
        onScroll={scroll.onScroll}
        style={{ maxHeight: 420, overflow: "auto", border: "1px solid #d5dbe3", borderRadius: 8 }}
      >
        <iframe
          title="Loan contract"
          sandbox=""
          srcDoc={contract.bodyHtml}
          style={{ width: "100%", height: 900, border: 0, pointerEvents: "none" }}
        />
      </div>
      {done || contract.status === "SIGNED" ? (
        <div>
          <p>Signed {formatDateTime((done ?? contract).signedAt ?? contract.signedAt ?? "")}</p>
          {(done ?? contract).signedDocId ? (
            <Button
              type="button"
              onClick={() => void downloadFile(`/documents/${(done ?? contract).signedDocId}/file`, `${contract.number}.html`)}
            >
              Download signed copy
            </Button>
          ) : null}
        </div>
      ) : (
        <form className="stack" onSubmit={(event) => void sign(event)}>
          <p className="hint">{scroll.ready ? "You can sign now." : "Scroll to the bottom of the contract before signing."}</p>
          <Field label="Full name">
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <SignaturePad onChange={setSignature} />
          <label className="checkbox-row">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            I have read and agree to this loan contract
          </label>
          {error ? <p className="error">{errorMessage(error, "Could not sign the contract")}</p> : null}
          <Button type="submit" disabled={!scroll.ready || !consent || !signature}>Sign contract</Button>
        </form>
      )}
    </main>
  );
}

export function StaffContractPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [contract, setContract] = useState<ContractView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [present, setPresent] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);

  async function load() {
    const row = await api<ContractView>(`/contracts/${id}`);
    setContract(row);
  }

  useEffect(() => {
    void load().catch(setError);
  }, [id]);

  async function sign(event: FormEvent) {
    event.preventDefault();
    if (!contract || !signature) return;
    try {
      await api(`/contracts/${id}/sign-in-branch`, {
        method: "POST",
        body: JSON.stringify({
          typedName: name,
          signaturePng: signature,
          borrowerPresent: true,
          contentSha256: contract.contentSha256,
        }),
      });
      await load();
    } catch (caught) {
      setError(caught);
    }
  }

  async function reissue(event: FormEvent) {
    event.preventDefault();
    if (!contract) return;
    try {
      const next = await api<LoanContractSummary>(`/loans/${contract.loanId}/contract/reissue`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      window.location.assign(`/staff/contracts/${next.id}`);
    } catch (caught) {
      setError(caught);
    }
  }

  if (!contract) {
    return <main className="staff-page"><p>{error ? errorMessage(error, "Could not load contract") : "Loading contract…"}</p></main>;
  }

  return (
    <main className="staff-page">
      <h1>{contract.number} · {contract.status}</h1>
      <p className="hint">Version {contract.version}{contract.signerMethod ? ` · ${contract.signerMethod}` : ""}{contract.signedAt ? ` · ${formatDateTime(contract.signedAt)}` : ""}</p>
      <iframe ref={frame} title="Loan contract" sandbox="" srcDoc={contract.bodyHtml} style={{ width: "100%", height: 640, border: "1px solid #d5dbe3" }} />
      <div className="hero-actions">
        <Button type="button" variant="secondary" onClick={() => window.print()}>Print</Button>
        {contract.signedDocId ? (
          <Button type="button" variant="secondary" onClick={() => void downloadFile(`/documents/${contract.signedDocId}/file`, `${contract.number}.html`)}>
            Download signed copy
          </Button>
        ) : null}
      </div>
      {contract.status === "ISSUED" && (user?.role === "MANAGER" || user?.role === "LOAN_OFFICER") ? (
        <form className="stack" onSubmit={(event) => void sign(event)}>
          <h2>Sign in branch</h2>
          <Field label="Borrower name">
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <SignaturePad onChange={setSignature} />
          <label className="checkbox-row">
            <input type="checkbox" checked={present} onChange={(event) => setPresent(event.target.checked)} />
            The borrower is present and has read this contract
          </label>
          <Button type="submit" disabled={!present || !signature}>Sign contract</Button>
        </form>
      ) : null}
      {contract.status === "ISSUED" && user?.role === "MANAGER" ? (
        <form className="stack" onSubmit={(event) => void reissue(event)}>
          <h2>Reissue</h2>
          <Field label="Reason">
            <input value={reason} onChange={(event) => setReason(event.target.value)} required />
          </Field>
          <Button type="submit" variant="secondary">Reissue contract</Button>
        </form>
      ) : null}
      {error ? <p className="error">{errorMessage(error, "Could not update the contract")}</p> : null}
    </main>
  );
}
