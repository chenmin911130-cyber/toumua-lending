import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(fileURLToPath(new URL("..", import.meta.url)), "dist");
const template = readFileSync(join(dist, "index.html"), "utf8");

const routes = [
  {
    path: "/",
    title: "Toumu’a Lending",
    description:
      "A COMP721 school demonstration of a New Zealand lending office workspace. Apply, review collateral, and track a secured loan. This is not an offer of credit.",
    heading: "Simple finance. Built around you.",
    body: "A COMP721 school demonstration for Toumu’a Money Transfer Ltd. Apply online with the security you can offer.",
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
    description: "Sign in to the Toumu’a Lending school demonstration.",
    heading: "Welcome back",
    body: "Sign in to apply, or to see an application already linked to your account.",
  },
  {
    path: "/register",
    title: "Create an account · Toumu’a Lending",
    description: "Register for a Toumu’a Lending demonstration account, then apply with collateral.",
    heading: "Create your account",
    body: "Register, then apply with the amount you need and the security you can offer.",
  },
  {
    path: "/about",
    title: "About · Toumu’a Lending",
    description: "Toumu’a Lending is a COMP721 school workspace built for Toumu’a Money Transfer Ltd.",
    heading: "About",
    body: "A teaching workspace for a small Auckland lending office. This is not an offer of credit.",
  },
  {
    path: "/privacy",
    title: "Privacy · Toumu’a Lending",
    description: "How this COMP721 demonstration handles names, emails, and loan-file data.",
    heading: "Privacy",
    body: "Demo accounts store only the data needed to mark the workspace. Do not submit live identity documents.",
  },
  {
    path: "/terms",
    title: "Terms · Toumu’a Lending",
    description: "Terms of use for the Toumu’a Lending COMP721 demonstration website.",
    heading: "Terms",
    body: "This website is a university demonstration. Figures and receipts do not create a loan contract.",
  },
  {
    path: "/responsible-lending",
    title: "Responsible lending · Toumu’a Lending",
    description: "How this demonstration talks about borrowing without presenting a live credit offer.",
    heading: "Responsible lending",
    body: "This school workspace records a lending process. It does not make a regulated credit assessment.",
  },
  {
    path: "/disclosures",
    title: "Disclosures · Toumu’a Lending",
    description: "Credit-disclosure notes for the Toumu’a Lending school demonstration.",
    heading: "Disclosures",
    body: "No FSP number or NZBN is claimed here. Calculator interest is a labelled demo placeholder.",
  },
  {
    path: "/loans",
    title: "Loan options · Toumu’a Lending",
    description: "Personal, vehicle, and business secured-loan workflows in this school demonstration.",
    heading: "Loan options",
    body: "Three demo workflows that use the same secured application and custody process.",
  },
  {
    path: "/loans/personal",
    title: "Personal loan · Toumu’a Lending",
    description: "A secured personal-loan workflow in the Toumu’a Lending school demonstration.",
    heading: "Personal loan",
    body: "Apply with the amount you need and the security you can offer.",
  },
  {
    path: "/loans/vehicle",
    title: "Vehicle finance · Toumu’a Lending",
    description: "A vehicle-finance workflow in the Toumu’a Lending school demonstration.",
    heading: "Vehicle finance",
    body: "Record a vehicle as security, then complete valuation and a decision.",
  },
  {
    path: "/loans/business",
    title: "Business finance · Toumu’a Lending",
    description: "A business-finance workflow in the Toumu’a Lending school demonstration.",
    heading: "Business finance",
    body: "Office lending for a small-business purpose, still using the secured process.",
  },
];

function applyRoute(html, route) {
  const canonical = `https://web-production-b5acc.up.railway.app${route.path === "/" ? "/" : route.path}`;
  let next = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(route.title)}</title>`)
    .replace(/content="A COMP721 school demonstration of a New Zealand lending office workspace\. Apply, review collateral, and track a secured loan\. This is not an offer of credit\."/g, `content="${escape(route.description)}"`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonical}" />`)
    .replace(/property="og:title" content="[^"]*"/, `property="og:title" content="${escape(route.title)}"`)
    .replace(/property="og:url" content="[^"]*"/, `property="og:url" content="${canonical}"`)
    .replace(/name="twitter:title" content="[^"]*"/, `name="twitter:title" content="${escape(route.title)}"`);

  const snapshot = `<div id="root"><div class="marketing-page"><p>Toumu’a Lending</p><h1>${escape(route.heading)}</h1><p>${escape(route.body)}</p><p><a href="/register">Get started</a> · <a href="/help">Talk to us</a></p></div></div>`;
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
    description: "That page is not part of the Toumu’a Lending demonstration.",
    heading: "This page is not here.",
    body: "The address may be mistyped, or the page is not part of this school demonstration.",
  }),
);

console.log(`Prerendered ${routes.length} marketing routes plus 404.html`);
