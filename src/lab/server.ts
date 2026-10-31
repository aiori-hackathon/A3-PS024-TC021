import express from 'express';
import { fileURLToPath } from 'node:url';
import { getTokenFor, redeem } from '../client/lib';
import { GATEWAY_URL, ISSUER_URL, PORTS } from '../common/contract';
import { summarize } from '../common/stats';

const LAB_PORT = 3005;
const PROXY_URL = `http://127.0.0.1:${PORTS.proxy}`;
const ORIGIN_URL = `http://127.0.0.1:${PORTS.origin}`;
const INDEX = fileURLToPath(new URL('./index.html', import.meta.url));

type Outcome = { status: number; body: string };
type Run = { actual: string; steps: string[] };
type Scenario = { expected: string; run: () => Promise<Run> };

function label(r: Outcome): string {
  if (r.status === 200) return '200 OK';
  try {
    return `${r.status} ${JSON.parse(r.body).error ?? r.body}`;
  } catch {
    return `${r.status} ${r.body.slice(0, 60)}`;
  }
}

function tamper(s: string): string {
  const i = s.length - 10;
  return s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
}

async function stats() {
  const r = await fetch(`${GATEWAY_URL}/__lab/stats`);
  return (await r.json()) as { mode: string; distinctSourceIps: string[] };
}

async function setMode(m: string) {
  const r = await fetch(`${GATEWAY_URL}/__lab/mode/${m}`, { method: 'POST' });
  if (!r.ok) throw new Error('could not switch gateway mode');
}

async function ensureTokenMode() {
  if ((await stats()).mode !== 'token') await setMode('token');
}

const scenarios: Record<string, Scenario> = {
  none: {
    expected: '401 TOKEN_REQUIRED',
    run: async () => {
      const r = await fetch(GATEWAY_URL + '/resource');
      const actual = label({ status: r.status, body: await r.text() });
      return { actual, steps: ['Request sent with no token', 'Gateway answers with a token challenge (WWW-Authenticate header)'] };
    },
  },
  valid: {
    expected: '200 OK',
    run: async () => {
      const t = await getTokenFor('/resource');
      const actual = label(await redeem('/resource', t));
      return {
        actual,
        steps: [
          'Client received a 401 challenge from the gateway',
          'Client blinded a token request and the issuer signed it',
          'Client unblinded the token and redeemed it',
          'Gateway: signature OK, context OK, not in replay cache, forwarded to the origin',
        ],
      };
    },
  },
  reused: {
    expected: '401 REPLAYED',
    run: async () => {
      const t = await getTokenFor('/resource');
      const first = label(await redeem('/resource', t));
      const second = label(await redeem('/resource', t));
      return { actual: second, steps: [`First use: ${first}`, `Second use of the same token: ${second}`, 'The replay cache remembered the token fingerprint'] };
    },
  },
  wrongctx: {
    expected: '401 WRONG_CONTEXT',
    run: async () => {
      const t = await getTokenFor('/resource');
      const actual = label(await redeem('/other', t));
      return { actual, steps: ['Token was issued for the path /resource', 'It was presented at /other', 'Gateway compared the challenge digest and rejected it'] };
    },
  },
  tampered: {
    expected: '401 INVALID',
    run: async () => {
      const t = await getTokenFor('/resource');
      const actual = label(await redeem('/resource', tamper(t.toString())));
      return { actual, steps: ['One character of a valid token was changed', 'Gateway signature check failed'] };
    },
  },
  malformed: {
    expected: '401 INVALID',
    run: async () => {
      const actual = label(await redeem('/resource', 'PrivateToken token=AAAA'));
      return { actual, steps: ['Authorization header contained a malformed token', 'Gateway could not parse or verify it'] };
    },
  },
  concurrent: {
    expected: '200 OK + 401 REPLAYED',
    run: async () => {
      const t = await getTokenFor('/resource');
      const [a, b] = await Promise.all([redeem('/resource', t), redeem('/resource', t)]);
      const actual = [label(a), label(b)].sort().join(' + ');
      return { actual, steps: ['The same token was sent twice at the same moment', 'Exactly one request won; the replay cache check is atomic'] };
    },
  },
  direct: {
    expected: '403 FORBIDDEN',
    run: async () => {
      const r = await fetch(ORIGIN_URL + '/resource');
      const actual = label({ status: r.status, body: await r.text() });
      return { actual, steps: ['Request sent straight to the origin, skipping the gateway', 'Origin requires its own secret, which only the gateway holds'] };
    },
  },
};

const app = express();
app.disable('x-powered-by');

app.get('/', (_req, res) => {
  res.sendFile(INDEX);
});

app.get('/api/status', async (_req, res) => {
  const probe = async (name: string, url: string, okStatuses: number[]) => {
    try {
      const r = await fetch(url);
      await r.text();
      return { name, ok: okStatuses.includes(r.status) };
    } catch {
      return { name, ok: false };
    }
  };
  const services = await Promise.all([
    probe('issuer', ISSUER_URL + '/.well-known/private-token-issuer-directory', [200]),
    probe('gateway', GATEWAY_URL + '/__lab/stats', [200]),
    probe('origin', ORIGIN_URL + '/resource', [200, 403]),
    probe('proxy', PROXY_URL + '/__lab/stats', [200]),
  ]);
  let mode = 'unknown';
  try {
    mode = (await stats()).mode;
  } catch {}
  res.json({ services, mode });
});

app.post('/api/scenario/:id', async (req, res) => {
  const id = req.params.id;
  const s = scenarios[id];
  if (!s) {
    res.status(404).json({ error: 'unknown scenario' });
    return;
  }
  try {
    await ensureTokenMode();
    const t0 = performance.now();
    const { actual, steps } = await s.run();
    res.json({ id, expected: s.expected, actual, pass: actual === s.expected, steps, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post('/api/sharedproxy', async (_req, res) => {
  try {
    const clients = ['client-1', 'client-2', 'client-3', 'client-4', 'client-5'];

    await setMode('ip-limit');
    const runA: { client: string; outcome: string }[] = [];
    for (const c of clients) {
      const r = await fetch(PROXY_URL + '/resource', { headers: { 'X-Client-Id': c } });
      await r.text();
      runA.push({ client: c, outcome: r.status === 200 ? 'ALLOWED (200)' : `BLOCKED (${r.status})` });
    }
    const ipsA = (await stats()).distinctSourceIps;

    await setMode('token');
    const runB: { client: string; outcome: string }[] = [];
    const tokens = new Map<string, Awaited<ReturnType<typeof getTokenFor>>>();
    for (const c of clients) {
      const auth = await getTokenFor('/resource', PROXY_URL);
      tokens.set(c, auth);
      const r = await redeem('/resource', auth, PROXY_URL, c);
      runB.push({ client: c, outcome: r.status === 200 ? 'ACCEPTED (200)' : `REJECTED (${r.status})` });
    }
    const replay = label(await redeem('/resource', tokens.get('client-2')!, PROXY_URL, 'client-2'));
    const ipsB = (await stats()).distinctSourceIps;

    res.json({
      runA,
      runB,
      replay,
      ipsA,
      ipsB,
      total: clients.length,
      blockedA: runA.filter((r) => r.outcome.startsWith('BLOCKED')).length,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post('/api/latency', async (_req, res) => {
  try {
    await ensureTokenMode();
    const WARM = 3;
    const RUNS = 30;
    const tokens: Awaited<ReturnType<typeof getTokenFor>>[] = [];
    const issuance: number[] = [];
    for (let i = 0; i < WARM + RUNS; i++) {
      const t0 = performance.now();
      tokens.push(await getTokenFor('/resource'));
      if (i >= WARM) issuance.push(performance.now() - t0);
    }
    const redemption: number[] = [];
    let failures = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t0 = performance.now();
      const r = await redeem('/resource', tokens[i]);
      const dt = performance.now() - t0;
      if (r.status !== 200) failures++;
      if (i >= WARM) redemption.push(dt);
    }
    res.json({ runs: RUNS, issuance: summarize(issuance), redemption: summarize(redemption), failures, samples: { issuance, redemption } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.listen(LAB_PORT, '127.0.0.1', () => console.log(`lab dashboard on http://127.0.0.1:${LAB_PORT}`));