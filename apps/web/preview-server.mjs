import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const port = Number(process.env.PORT ?? 4173);
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001";

const SPA_PREFIXES = [
  "/customer",
  "/staff",
  "/account",
  "/notifications",
  "/login",
  "/register",
  "/help",
  "/about",
  "/privacy",
  "/terms",
  "/responsible-lending",
  "/disclosures",
  "/loans",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/accept-invitation",
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function isSpaPath(pathname) {
  if (pathname === "/") return true;
  return SPA_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function applySecurity(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

function applyCache(pathname, res) {
  if (pathname.startsWith("/assets/")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }
  if (/\.(?:webp|jpg|jpeg|png|svg|ico|woff2)$/i.test(pathname) || pathname.startsWith("/images/")) {
    res.setHeader("Cache-Control", "public, max-age=604800");
    return;
  }
  res.setHeader("Cache-Control", "no-cache");
}

function safeFile(pathname) {
  if (pathname.split("/").includes("..")) return null;
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const full = normalize(join(root, relative));
  if (!full.startsWith(root + sep) && full !== root) return null;
  return full;
}

function sendFile(req, res, filePath, status = 200) {
  const type = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  const compressible = /text|javascript|json|xml|svg/.test(type);
  const wantsGzip = String(req.headers["accept-encoding"] ?? "").includes("gzip");
  if (compressible && wantsGzip) {
    res.setHeader("Content-Encoding", "gzip");
    createReadStream(filePath).pipe(zlib.createGzip()).pipe(res);
    return;
  }
  createReadStream(filePath).pipe(res);
}

function send404(req, res) {
  const custom = join(root, "404.html");
  if (existsSync(custom)) {
    sendFile(req, res, custom, 404);
    return;
  }
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end("<!doctype html><title>Not found</title><h1>Not found</h1>");
}

function proxyApi(req, res) {
  const dest = new URL(req.url ?? "/", apiTarget);
  const client = dest.protocol === "https:" ? https : http;
  const proxy = client.request(
    dest,
    {
      method: req.method,
      headers: { ...req.headers, host: dest.host },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  proxy.on("error", () => {
    res.statusCode = 502;
    res.end("Bad gateway");
  });
  req.pipe(proxy);
}

process.on("uncaughtException", (error) => {
  console.error("uncaughtException", error);
});

const server = http.createServer((req, res) => {
  applySecurity(res);
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.statusCode = 400;
    res.end("Bad request");
    return;
  }
  if (pathname.split("/").includes("..")) {
    res.statusCode = 400;
    res.end("Bad request");
    return;
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    proxyApi(req, res);
    return;
  }

  applyCache(pathname, res);

  const direct = safeFile(pathname);
  if (direct && existsSync(direct) && statSync(direct).isFile()) {
    sendFile(req, res, direct);
    return;
  }

  const asIndex = direct ? join(direct, "index.html") : null;
  if (asIndex && existsSync(asIndex)) {
    sendFile(req, res, asIndex);
    return;
  }

  if (isSpaPath(pathname)) {
    sendFile(req, res, join(root, "index.html"));
    return;
  }

  send404(req, res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Toumu’a web listening on ${port}`);
});
