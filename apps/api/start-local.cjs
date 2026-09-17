const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "../../.env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index < 0) continue;
  const key = trimmed.slice(0, index);
  if (process.env[key] == null) process.env[key] = trimmed.slice(index + 1);
}

process.stdout.write(`env-loaded port=${process.env.API_PORT}\n`);
require("./dist/run.cjs");
