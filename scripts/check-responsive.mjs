#!/usr/bin/env node
/**
 * Wrapper del check responsive su browser headless.
 * Richiede python3 + playwright e un server locale raggiungibile:
 * se mancano, il check viene saltato senza far fallire la release.
 */
import { spawnSync } from "node:child_process";

const base = process.env.QA_BASE_URL ?? "http://localhost:8080";

const hasPlaywright =
  spawnSync("python3", ["-c", "import playwright"], { stdio: "ignore" }).status === 0;
if (!hasPlaywright) {
  console.log("Responsive check SALTATO: python3 + playwright non disponibili in questo ambiente.");
  process.exit(0);
}

let reachable = false;
try {
  const res = await fetch(base, { signal: AbortSignal.timeout(4000) });
  reachable = res.ok;
} catch {
  reachable = false;
}
if (!reachable) {
  console.log(`Responsive check SALTATO: nessun server su ${base}.`);
  process.exit(0);
}

const run = spawnSync("python3", ["scripts/responsive-audit.py"], {
  stdio: "inherit",
  env: { ...process.env, QA_BASE_URL: base },
});
process.exit(run.status ?? 1);
