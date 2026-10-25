import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import {
  publicVerif,
  WWWAuthenticateHeader,
  AuthorizationHeader,
  sendTokenRequest,
} from '@cloudflare/privacypass-ts';
import { GATEWAY_URL, ISSUER_URL } from '../common/contract';
import { summarize } from '../common/stats';

const WARMUP = 10;
const RUNS = 100;
const PATH = '/resource';

// Make sure the gateway is in token mode with a clean replay cache
await fetch(`${GATEWAY_URL}/__lab/mode/token`, { method: 'POST' });

// Get the challenge once (it only depends on the path)
const first = await fetch(GATEWAY_URL + PATH);
const header = first.headers.get('www-authenticate');
if (first.status !== 401 || !header) throw new Error('expected a 401 challenge from the gateway');
const parsed = WWWAuthenticateHeader.parse(header)[0];

async function issueOne(): Promise<AuthorizationHeader> {
  // One Client object per token: it keeps blinding state between the steps.
  const client = new publicVerif.Client(publicVerif.BlindRSAMode.PSS);
  const req = await client.createTokenRequest(parsed.challenge, parsed.tokenKey);
  const bytes = await sendTokenRequest(req.serialize(), `${ISSUER_URL}/token-request`);
  const token = await client.finalize(client.deserializeTokenResponse(bytes));
  return new AuthorizationHeader(token);
}

// 1) Issuance latency
const tokens: AuthorizationHeader[] = [];
const issuance: number[] = [];
for (let i = 0; i < WARMUP + RUNS; i++) {
  const t0 = performance.now();
  tokens.push(await issueOne());
  const dt = performance.now() - t0;
  if (i >= WARMUP) issuance.push(dt);
}

// 2) Redemption latency (each token is used exactly once)
const redemption: number[] = [];
let failures = 0;
for (let i = 0; i < tokens.length; i++) {
  const t0 = performance.now();
  const res = await fetch(GATEWAY_URL + PATH, { headers: { Authorization: tokens[i].toString() } });
  await res.text();
  const dt = performance.now() - t0;
  if (res.status !== 200) failures++;
  if (i >= WARMUP) redemption.push(dt);
}

// 3) Baseline: request without a token (gateway only returns the challenge)
const baseline: number[] = [];
for (let i = 0; i < WARMUP + RUNS; i++) {
  const t0 = performance.now();
  const res = await fetch(GATEWAY_URL + PATH);
  await res.text();
  const dt = performance.now() - t0;
  if (i >= WARMUP) baseline.push(dt);
}

const results = [
  { name: 'Issuance (blind, issuer signs, unblind)', s: summarize(issuance) },
  { name: 'Redemption (gateway verifies and forwards)', s: summarize(redemption) },
  { name: 'Baseline: 401 challenge, no token', s: summarize(baseline) },
];
const f = (n: number) => n.toFixed(2);

console.log('');
results.forEach((r) =>
  console.log(`${r.name}\n  runs=${r.s.n}  mean=${f(r.s.mean)} ms  p50=${f(r.s.p50)} ms  p95=${f(r.s.p95)} ms  max=${f(r.s.max)} ms`)
);
console.log(`\nredemption failures (expected 0): ${failures}`);

const cpu = os.cpus()[0]?.model ?? 'unknown CPU';
const md = [
  '# Latency results',
  '',
  `Run: ${new Date().toISOString()}`,
  '',
  `Machine: ${os.platform()} ${os.release()}, ${cpu} (${os.cpus().length} logical cores), Node ${process.version}`,
  '',
  `Method: ${WARMUP} warm-up runs (not counted), then ${RUNS} measured runs per operation, timed with performance.now(). All services run on localhost, so network delay is not included.`,
  '',
  '| Operation | Runs | Mean (ms) | p50 (ms) | p95 (ms) | Max (ms) |',
  '|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.name} | ${r.s.n} | ${f(r.s.mean)} | ${f(r.s.p50)} | ${f(r.s.p95)} | ${f(r.s.max)} |`),
  '',
  `Redemption failures: ${failures}`,
  '',
  `Verification overhead (redemption mean minus no-token baseline mean): ${f(results[1].s.mean - results[2].s.mean)} ms`,
  '',
  'Operational overhead: issuance needs one extra round trip to the issuer, and the gateway keeps one replay-cache entry (a 64-character fingerprint plus an expiry time) per redeemed token until its TTL expires.',
  '',
].join('\n');
const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs');
mkdirSync(docsDir, { recursive: true });
writeFileSync(join(docsDir, 'latency-results.md'), md);
console.log('saved docs/latency-results.md');
process.exitCode = failures === 0 ? 0 : 1;
