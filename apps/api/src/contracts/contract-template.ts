import { createHash } from "node:crypto";
import { LEGAL_ENTITY } from "@toumua/contracts";
import { aucklandDay } from "../common/dates";

export const CONTRACT_CLAUSES = [
  "This demonstration agreement records a secured loan between the lender and the borrower named above.",
  "The borrower will repay the principal and the stated interest in the instalments listed in the schedule.",
  "Each instalment is due on the date shown. A missed instalment may be treated as a default after the office has contacted the borrower.",
  "The listed assets are security for the loan. The borrower confirms they may offer those assets and will not sell or pawn them while the loan is outstanding.",
  "If the loan is in default and is not put right, the office may sell the security and apply the proceeds to the amount still owed, as described in the loan terms.",
  "The borrower confirms they have read this contract, including the schedule and the security list, before signing.",
];

export type ContractRenderInput = {
  number: string;
  issuedAt: Date;
  borrowerName: string;
  borrowerNumber: string;
  borrowerAddress: string;
  principal: string;
  annualRateBps: number;
  loyaltyTier?: "STANDARD" | "RETURNING" | "LOYAL";
  discountBps?: number;
  frequency: string;
  periods: number;
  schedule: Array<{ number: number; dueDate: Date; amount: string }>;
  assets: Array<{ name: string; identifier: string | null; valuationAmount: string | null }>;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Whole basis points as a percent string, without floating-point money maths. */
export function formatAnnualRate(bps: number): string {
  const sign = bps < 0 ? "-" : "";
  const abs = Math.abs(bps);
  const whole = Math.trunc(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${frac}%`;
}

function formatDue(date: Date): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rateLine(input: ContractRenderInput): string {
  const tier = input.loyaltyTier ?? "STANDARD";
  const discountBps = input.discountBps ?? 0;
  if (discountBps <= 0 || tier === "STANDARD") {
    return `Annual rate: ${formatAnnualRate(input.annualRateBps)} simple interest.`;
  }
  const baseBps = input.annualRateBps + discountBps;
  const label = tier === "LOYAL" ? "loyal-customer" : "returning-customer";
  return `Annual rate: ${formatAnnualRate(baseBps)} p.a. less ${formatAnnualRate(discountBps)} ${label} discount = ${formatAnnualRate(input.annualRateBps)} p.a.`;
}

export function renderContract(input: ContractRenderInput): string {
  const rows = input.schedule
    .map(
      (entry) =>
        `<tr><td>${entry.number}</td><td>${escapeHtml(formatDue(entry.dueDate))}</td><td>${escapeHtml(entry.amount)}</td></tr>`,
    )
    .join("");
  const assets = input.assets
    .map((asset) => {
      const name = escapeHtml(asset.name);
      const identifier = escapeHtml(asset.identifier?.trim() || "—");
      const value = escapeHtml(asset.valuationAmount ?? "—");
      return `<li>${name} · identifier ${identifier} · valuation ${value}</li>`;
    })
    .join("");
  const clauses = CONTRACT_CLAUSES.map((clause) => `<li>${escapeHtml(clause)}</li>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Loan contract ${escapeHtml(input.number)}</title>
<style>
  body { font-family: Georgia, serif; color: #1c2430; margin: 32px; line-height: 1.45; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0 24px; }
  th, td { border-bottom: 1px solid #d5dbe3; text-align: left; padding: 6px 8px; }
  .note { color: #5c6b7a; font-size: 13px; }
</style>
</head>
<body>
  <h1>Loan contract ${escapeHtml(input.number)}</h1>
  <p>Issued ${escapeHtml(formatDue(input.issuedAt))}</p>
  <h2>Parties</h2>
  <p>Lender: ${escapeHtml(LEGAL_ENTITY)}</p>
  <p>Borrower: ${escapeHtml(input.borrowerName)} (${escapeHtml(input.borrowerNumber)})</p>
  <p>Address: ${escapeHtml(input.borrowerAddress)}</p>
  <h2>Loan terms</h2>
  <p>Principal: $${escapeHtml(input.principal)}</p>
  <p>${escapeHtml(rateLine(input))}</p>
  <p>Fees: none are charged on this demonstration contract.</p>
  <p>Repayments: ${input.periods} ${escapeHtml(input.frequency.toLowerCase())} instalments.</p>
  <h2>Repayment schedule</h2>
  <table>
    <thead><tr><th>#</th><th>Due date</th><th>Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>Security</h2>
  <ul>${assets || "<li>No security assets recorded.</li>"}</ul>
  <h2>Clauses</h2>
  <ol>${clauses}</ol>
  <p>By signing, the borrower confirms these terms, the schedule, and the security list.</p>
  <h2>Signature</h2>
  <p>Borrower signature: waiting.</p>
  <p class="note">Demonstration contract for COMP721. Not legal advice.</p>
</body>
</html>`;
}

export function renderSignedContract(
  bodyHtml: string,
  input: {
    signerName: string;
    signerRole: string;
    signerMethod: string;
    signedAt: Date;
    ip: string | null;
    userAgent: string | null;
    contentSha256: string;
    signaturePngDataUrl: string;
    witnessName: string | null;
  },
): string {
  const when = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    dateStyle: "full",
    timeStyle: "short",
  }).format(input.signedAt);
  const page = `<section>
  <h2>Execution</h2>
  <p>Signed by ${escapeHtml(input.signerName)} (${escapeHtml(input.signerRole)}) using ${escapeHtml(input.signerMethod)}.</p>
  <p>Auckland time: ${escapeHtml(when)}</p>
  <p>IP: ${escapeHtml(input.ip ?? "not recorded")}</p>
  <p>Browser: ${escapeHtml(input.userAgent ?? "not recorded")}</p>
  ${input.witnessName ? `<p>Witnessed by ${escapeHtml(input.witnessName)}</p>` : ""}
  <p>Signed hash: ${escapeHtml(input.contentSha256)}</p>
  <img alt="Signature" src="${escapeHtml(input.signaturePngDataUrl)}" />
</section>`;
  return bodyHtml.replace("</body>", `${page}</body>`);
}
