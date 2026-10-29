#!/usr/bin/env bun
/**
 * thresher-serve.ts — real TypeScript runner for the estate thresher
 * (mcpproxy-go) server, replacing the fragile `thresher-serve.sh` bash shims.
 *
 * Sources the thresher API key + optional EXA key from secretsmith (the SSOT),
 * ensures mcp_config.json exists (seeds from .dist), then spawns `thresher
 * serve`. Pure TypeScript; no bash indirection.
 *
 * Change: replaced `secretsmith env` + unquote() with `secretsmith get --label X --show`.
 * The unquote was a documented 401 root cause (quoted values leaked into the daemon env).
 */
import { existsSync, chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// 2026-10-28: /home/toxic/estate is a FORBIDDEN ghost path (estate single-truth
// lease — see AGENTS.md rule: /home/toxic/estate must NOT exist in any form).
// The SSOT config lives in the estate control plane at pens/estate/ranch/thresher/.
const ESTATE = '/home/toxic/pens/estate'
const CFG = `${ESTATE}/ranch/thresher/mcp_config.json`
const DIST = `${ESTATE}/ranch/thresher/mcp_config.json.dist`

/**
 * Resolve a secret from the keyring via `secretsmith get --label X --show`.
 * Replaces the old `secretsmith env` + unquote() pattern — the unquote was a
 * documented 401 root cause because quoted values leaked into the daemon env.
 * Uses `get --show` which returns unquoted values.
 */
function secret(key: string): string | undefined {
  // Primary: keyring SSOT (secretsmith get --label X --show, unquoted).
  // The thresher management key is stored as THRESHER_API_KEY (anomaly #16:
  // --app exact-match; service attrs are unreliable — filter by label only).
  const label = key === 'MCPPROXY_API_KEY' ? 'THRESHER_API_KEY' : key
  for (const l of [label, ...(label.startsWith('THRESHER') ? [] : ['THRESHER_' + label.replace(/_API_KEY$/, '')])]) {
    const sm = spawnSync('/home/toxic/.local/bin/secretsmith', ['get', '--label', l, '--show'], { encoding: 'utf8' })
    if (sm.status === 0) {
      const line = sm.stdout.match(/^secret: (.+)$/m)
      if (line) return line[1]
    }
  }
  // Fallback: ~/.secrets (a fallback record, never the source)
  try {
    const s = readFileSync('/home/toxic/.secrets', 'utf8')
    const m = s.match(new RegExp(`^${key}=(.*)$`, 'm'))
    return m?.[1]?.trim() || undefined
  } catch {
    return undefined
  }
}

const apiKey = secret('MCPPROXY_API_KEY')
if (!apiKey) {
  console.error('MCPPROXY_API_KEY missing from secretsmith/~/.secrets')
  process.exit(1)
}
const env: typeof process.env = { ...process.env, MCPPROXY_API_KEY: apiKey }

// Inject provider keys from the secretsmith keyring (SSOT) into the thresher
// process so thresher MCP plugins that read `process.env.*_API_KEY` (e.g.
// delendai auto-agent-selector, provider recon) see every working provider
// instead of only the ones already set. Names only — values resolved via
// `secretsmith get --show` (unquoted, per the documented 401 root cause).
const SELECTOR_PROVIDER_KEYS = [
  'EXA_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
  'DEEPSEEK_API_KEY',
  'MISTRAL_API_KEY',
  'XAI_API_KEY',
  'FREEINFERENCE_API_KEY',
] as const
for (const k of SELECTOR_PROVIDER_KEYS) {
  if (!env[k]) env[k] = secret(k) ?? ''
}

if (!existsSync(CFG) && existsSync(DIST)) {
  writeFileSync(CFG, readFileSync(DIST, 'utf8'))
  chmodSync(CFG, 0o600)
}
if (!existsSync(CFG)) throw new Error(`no thresher config at ${CFG}`)

// SSOT (2026-10-27): secretsmith is the single source for the management API
// key. Sync the live config's api_key to the secretsmith value on every start
// so the gitignored local config never drifts from the SSOT. No rotation:
// the value is copied, never minted or changed.
try {
  const cfgJson = JSON.parse(readFileSync(CFG, 'utf8'))
  if (cfgJson.api_key !== apiKey) {
    cfgJson.api_key = apiKey
    writeFileSync(CFG, JSON.stringify(cfgJson, null, 2))
    chmodSync(CFG, 0o600)
  }
} catch (e) {
  console.error('thresher-serve: could not sync config api_key to secretsmith:', e)
}

// thresher is the estate's own fork of mcpproxy-go. Its `serve` entrypoint is
// the Go gateway binary at ./cmd/mcpproxy, built directly from the module root
// (pens/ranch/thresher) — no vendored upstream clone. Rebuild with build.sh.
const THRESHER_BIN = '/home/toxic/pens/ranch/thresher/bin/thresher'
if (!existsSync(THRESHER_BIN)) {
  console.error('thresher (fork of mcpproxy-go) binary missing:')
  console.error('  run: /home/toxic/pens/ranch/thresher/build.sh')
  process.exit(1)
}

const result = spawnSync(
  THRESHER_BIN,
  ['serve', `--config=${CFG}`, '--listen=127.0.0.1:25127'],
  { env, stdio: 'inherit' }
)
process.exit(result.status ?? 1)
