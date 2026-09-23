import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(fileURLToPath(new URL("..", import.meta.url)), "dist");
const template = readFileSync(join(dist, "index.html"), "utf8");

const routes = [
  {
    path: "/",
    title: "Toumu’a Lending",
    description: "Secured loans for personal, vehicle and business needs.",
    heading: "Simple finance. Built around you.",
    body: "Secured loans for personal, vehicle and business needs.",
  },
  {
    path: "/help",
    title: "Contact · Toumu’a Lending",
    description: "Call or email the Toumu’a Lending office about an application, repayment, or security asset.",
    heading: "We’re here to help.",
    body: "Speak with the office about an application, repayment, or security asset.",
  },
  {
    path: "/login",
    title: "Log in · Toumu’a Lending",
    description: "Sign in to Toumu’a Lending.",
    heading: "Welcome back",
    body: "Sign in to apply, or to see an application already linked to your account.",
  },
  {
    path: "/register",
    title: "Create an account · Toumu’a Lending",
    description: "Register for a Toumu’a Lending account, then apply with collateral.",
    heading: "Create your account",
    body: "Register, then apply with the amount you need and the security you can offer.",
  },
  {
    path: "/about",
    title: "About · Toumu’a Lending",
    description: "Toumu’a Lending is a small Auckland lending office.",
    heading: "About",
    body: "Toumu’a Lending is a small Auckland lending office. Secured loans for personal, vehicle and business needs.",
  },
  {
    path: "/privacy",
    title: "Privacy · Toumu’a Lending",
    description: "How Toumu’a Lending handles names, emails, and loan-file data.",
    heading: "Privacy",
    body: "Accounts store the data needed to process your application. Contact the office to request removal.",
  },
  {
    path: "/terms",
    title: "Terms · Toumu’a Lending",
    description: "Terms of use for the Toumu’a Lending website.",
    heading: "Terms",
    body: "Loans are arranged with our office. Terms apply. A written offer confirms the contract.",
  },
  {
    path: "/responsible-lending",
    title: "Responsible lending · Toumu’a Lending",
    description: "How Toumu’a Lending talks about borrowing and written offers.",
    heading: "Responsible lending",
    body: "Our office records suitability and affordability before a written offer is made.",
  },
  {
    path: "/disclosures",
    title: "Disclosures · Toumu’a Lending",
    description: "Credit-disclosure notes for Toumu’a Lending.",
    heading: "Disclosures",
    body: "No FSP number or NZBN is claimed on this website. Calculator interest is an illustrative estimate.",
  },
  {
    path: "/loans",
    title: "Loan options · Toumu’a Lending",
    description: "Personal, vehicle, and business secured loans from Toumu’a Lending.",
    heading: "Loan options",
    body: "Secured loans for personal, vehicle and business needs.",
  },
  {
    path: "/loans/personal",
    title: "Personal loan · Toumu’a Lending",
    description: "A secured personal loan recorded in the office, with collateral held until the balance is cleared.",
    heading: "Personal loan",
    body: "Apply with the amount you need and the security you can offer.",
  },
  {
    path: "/loans/vehicle",
    title: "Vehicle finance · Toumu’a Lending",
    description: "The same secured-lending workflow, with a vehicle used as security.",
    heading: "Vehicle finance",
    body: "Record a vehicle as security, then complete valuation and a decision.",
  },
  {
    path: "/loans/business",
    title: "Business finance · Toumu’a Lending",
    description: "Office lending for a small-business purpose, still using the secured process.",
    heading: "Business finance",
    body: "Office lending for a small-business purpose, still using the secured process.",
  },
];

function applyRoute(html, route) {
  const canonical = `https://web-production-b5acc.up.railway.app${route.path === "/" ? "/" : route.path}`;
  let next = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(route.title)}</title>`)
    .replace(/content="Secured loans for personal, vehicle and business needs\."/g, `content="${escape(route.description)}"`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonical}" />`)
    .replace(/property="og:title" content="[^"]*"/, `property="og:title" content="${escape(route.title)}"`)
    .replace(/property="og:url" content="[^"]*"/, `property="og:url" content="${canonical}"`)
    .replace(/name="twitter:title" content="[^"]*"/, `name="twitter:title" content="${escape(route.title)}"`);

  const snapshot = `<div id="root"><div class="marketing-page"><p>Toumu’a Lending</p><h1>${escape(route.heading)}</h1><p>${escape(route.body)}</p><p><a href="/login">Get started</a> · <a href="/help">Talk to us</a></p></div></div>`;
  next = next.replace(/<div id="root">[\s\S]*?<\/div>\s*<script/, `${snapshot}\n    <script`);
  return next;
}

function escape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

for (const route of routes) {
  const html = applyRoute(template, route);
  const file =
    route.path === "/" ? join(dist, "index.html") : join(dist, route.path.replace(/^\//, ""), "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

writeFileSync(
  join(dist, "404.html"),
  applyRoute(template, {
    path: "/404",
    title: "Page not found · Toumu’a Lending",
    description: "That page is not on Toumu’a Lending.",
    heading: "This page is not here.",
    body: "The address may be mistyped, or the page is no longer available.",
  }),
);

console.log(`Prerendered ${routes.length} marketing routes plus 404.html`);
