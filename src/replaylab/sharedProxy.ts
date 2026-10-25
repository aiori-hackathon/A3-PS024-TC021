import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthorizationHeader } from '@cloudflare/privacypass-ts';
import { getTokenFor, redeem } from '../client/lib';
import { GATEWAY_URL, PORTS } from '../common/contract';

// Every client below talks to the gateway THROUGH the shared proxy, so the
// gateway sees one source address for all of them.
const PROXY_URL = `http://127.0.0.1:${PORTS.proxy}`;
const CLIENTS = ['client-1', 'client-2', 'client-3', 'client-4', 'client-5'];

type Result = { client: string; outcome: string };

async function setMode(m: string) {
  const r = await fetch(`${GATEWAY_URL}/__lab/mode/${m}`, { method: 'POST' });
  if (!r.ok) throw new Error('could not switch gateway mode');
}

async function stats() {
  const r = await fetch(`${GATEWAY_URL}/__lab/stats`);
  return (await r.json()) as { mode: string; distinctSourceIps: string[] };
}

// Run A: IP-based rate limiting (baseline), limit 3 requests per minute per IP
await setMode('ip-limit');
const runA: Result[] = [];
for (const c of CLIENTS) {
  const res = await fetch(PROXY_URL + '/resource', { headers: { 'X-Client-Id': c } });
  runA.push({ client: c, outcome: res.status === 200 ? 'ALLOWED (200)' : `BLOCKED (${res.status})` });
}
const statsA = await stats();

// Run B: Privacy Pass tokens, each client redeems its own token
await setMode('token');
const runB: Result[] = [];
const tokens = new Map<string, AuthorizationHeader>();
for (const c of CLIENTS) {
  const auth = await getTokenFor('/resource', PROXY_URL);
  tokens.set(c, auth);
  const r = await redeem('/resource', auth, PROXY_URL, c);
  runB.push({ client: c, outcome: r.status === 200 ? 'ACCEPTED (200)' : `REJECTED (${r.status})` });
}
// client-2 tries to reuse its already spent token
const replay = await redeem('/resource', tokens.get('client-2')!, PROXY_URL, 'client-2');
let replayError = replay.body;
try {
  replayError = JSON.parse(replay.body).error;
} catch {}
const replayOutcome = `${replay.status} ${replayError}`;
const statsB = await stats();

const blockedA = runA.filter((r) => r.outcome.startsWith('BLOCKED')).length;
const acceptedB = runB.filter((r) => r.outcome.startsWith('ACCEPTED')).length;

console.log('\nRun A: IP-based limit (3 per minute per IP)');
runA.forEach((r) => console.log(`  ${r.client}: ${r.outcome}`));
console.log(`  gateway saw source IPs: ${statsA.distinctSourceIps.join(', ')}`);
console.log(`  legitimate clients blocked: ${blockedA} of ${CLIENTS.length}`);
console.log('\nRun B: Privacy Pass tokens');
runB.forEach((r) => console.log(`  ${r.client}: ${r.outcome}`));
console.log(`  client-2 reuses its token: ${replayOutcome}`);
console.log(`  gateway saw source IPs: ${statsB.distinctSourceIps.join(', ')}`);

const table = (rows: Result[]) => ['| Client | Outcome |', '|---|---|', ...rows.map((r) => `| ${r.client} | ${r.outcome} |`)];
const md = [
  '# Shared-proxy test results',
  '',
  `Run: ${new Date().toISOString()}`,
  '',
  `Setup: ${CLIENTS.length} clients send requests through one proxy (port ${PORTS.proxy}), so the gateway sees a single source address. Baseline limit: 3 requests per minute per IP.`,
  '',
  '## Run A: IP-based rate limiting (baseline)',
  '',
  ...table(runA),
  '',
  `Source addresses seen by the gateway: ${statsA.distinctSourceIps.join(', ')}`,
  '',
  `Legitimate clients blocked: ${blockedA} of ${CLIENTS.length}`,
  '',
  '## Run B: Privacy Pass tokens',
  '',
  ...table(runB),
  '',
  `Replay attempt by client-2 with an already spent token: ${replayOutcome}`,
  '',
  `Source addresses seen by the gateway: ${statsB.distinctSourceIps.join(', ')}`,
  '',
  '## Conclusion',
  '',
  'With one shared egress address, the IP limiter blocked legitimate clients, while the token gateway decided per token and accepted every client once. The gateway still sees the proxy source address: Privacy Pass does not hide transport-layer IP addresses.',
  '',
].join('\n');
const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs');
mkdirSync(docsDir, { recursive: true });
writeFileSync(join(docsDir, 'shared-proxy-results.md'), md);
console.log('\nsaved docs/shared-proxy-results.md');

const ok =
  blockedA === 2 &&
  acceptedB === CLIENTS.length &&
  replay.status === 401 &&
  replayError === 'REPLAYED' &&
  statsA.distinctSourceIps.length === 1 &&
  statsB.distinctSourceIps.length === 1;
console.log(ok ? '\nRESULT: PASS' : '\nRESULT: CHECK OUTPUT (unexpected numbers)');
process.exitCode = ok ? 0 : 1;
