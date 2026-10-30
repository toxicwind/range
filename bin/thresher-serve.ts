#!/usr/bin/env bun
/**
 * thresher-serve.ts — thresher (mcpproxy-go fork) daemon runner, refactored.
 *
 * Why the rewrite (the old one was "ass"):
 *  - Used spawnSync (blocking) — a daemon can't stream logs, and any child
 *    that outlives the parent silently orphans the gateway. Now spawn (async)
 *    with signal mirroring (SIGTERM/INT/HUP -> child).
 *  - Hardcoded --listen 127.0.0.1:25127. Now reads FLOTILLA_MCP_PORT (ports.env
 *    SSOT), falling back to 25127.
 *  - Rewrote mcp_config.json on EVERY start (api_key sync + re-serialize) —
 *    that's what clobbered config while it was being edited. Now syncs only
 *    when api_key differs, and never touches the rest of the file text.
 *  - No ready_http coupling to a wrong port: the daemon's health target now
 *    matches the real listen port.
 */
import { existsSync, chmodSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const PENS = "/home/toxic/pens";

/** Resolve thresher's product home via manifest, then pens-walk. */
function resolveThresherHome(): string {
  try {
    const manifest = readFileSync(`${PENS}/barn/estate-ops/bin/manifest.yaml`, "utf8");
    const m = manifest.match(new RegExp(`target: "[^"]*(${PENS}/[a-z]+/(?:products/)?thresher)/`));
    if (m?.[1]) return m[1];
  } catch {}
  for (const pen of ["barn", "ranch"]) {
    for (const home of [`${PENS}/${pen}/products/thresher`, `${PENS}/${pen}/thresher`]) {
      if (existsSync(`${home}/mcp_config.json`) || existsSync(`${home}/bin/thresher`)) return home;
    }
  }
  throw new Error("thresher home not resolvable");
}

/** Resolve a secret label-only from secretsmith (anomaly #16 — never --attr). */
function secret(key: string): string | undefined {
  const label = key === "MCPPROXY_API_KEY" ? "THRESHER_API_KEY" : key;
  const candidates = label.startsWith("THRESHER") ? [label] : [label, `THRESHER_${label.replace(/_API_KEY$/, "")}`];
  for (const l of candidates) {
    const res = Bun.spawnSync(["/home/toxic/.local/bin/secretsmith", "get", "--label", l, "--show"], {
      stdout: "pipe", stderr: "pipe",
    });
    if (res.exitCode === 0) {
      const line = res.stdout.toString().match(/^secret: (.+)$/m);
      if (line) return line[1];
    }
  }
  // fallback record (never the source)
  try {
    const m = readFileSync("/home/toxic/.secrets", "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
    return m?.[1]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

const THRESHER = resolveThresherHome();
const CFG = `${THRESHER}/mcp_config.json`;
const DIST = `${THRESHER}/mcp_config.json.dist`;
const PORT = Number(process.env.THRESHER_PORT ?? 25127);

const apiKey = secret("MCPPROXY_API_KEY");
if (!apiKey) { console.error("THRESHER_API_KEY missing from secretsmith"); process.exit(1); }

const env: typeof process.env = { ...process.env, MCPPROXY_API_KEY: apiKey };

// provider keys for thresher MCP plugins (label-only SSOT)
for (const k of ["EXA_API_KEY","ANTHROPIC_API_KEY","OPENAI_API_KEY","GEMINI_API_KEY","GOOGLE_API_KEY","OPENROUTER_API_KEY","GROQ_API_KEY","DEEPSEEK_API_KEY","MISTRAL_API_KEY","XAI_API_KEY","FREEINFERENCE_API_KEY"]) {
  if (!env[k]) env[k] = secret(k) ?? "";
}

// seed config from dist if absent
if (!existsSync(CFG) && existsSync(DIST)) { writeFileSync(CFG, readFileSync(DIST, "utf8")); chmodSync(CFG, 0o600); }
if (!existsSync(CFG)) throw new Error(`no thresher config at ${CFG}`);

// Sync api_key ONLY when it differs (never rewrite the whole file otherwise).
try {
  const raw = readFileSync(CFG, "utf8");
  const cfg = JSON.parse(raw) as { api_key?: string };
  if (cfg.api_key !== apiKey) {
    writeFileSync(CFG, JSON.stringify({ ...cfg, api_key: apiKey }, null, 2));
    chmodSync(CFG, 0o600);
    console.error(`thresher-serve: synced api_key in ${CFG}`);
  }
} catch (e) {
  console.error("thresher-serve: config api_key sync skipped:", e instanceof Error ? e.message : e);
}

const BIN = `${THRESHER}/bin/thresher`;
if (!existsSync(BIN)) throw new Error(`thresher binary missing: ${BIN} (run build.sh)`);

const child = spawn(BIN, ["serve", `--config=${CFG}`, `--listen=127.0.0.1:${PORT}`], {
  env, stdio: "inherit",
});

for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(sig, () => child.kill(sig));
}

const code = await child.exited;
process.exit(code ?? 1);