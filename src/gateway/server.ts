import express from 'express';
import { createHash } from 'node:crypto';
import {
  publicVerif,
  AuthorizationHeader,
  WWWAuthenticateHeader,
  TOKEN_TYPES,
  PRIVATE_TOKEN_ISSUER_DIRECTORY,
} from '@cloudflare/privacypass-ts';
import { PORTS, ISSUER_URL, ORIGIN_NAME, type GatewayError } from '../common/contract';
import { importIssuerKey } from '../common/keys';
import { challengeFor } from '../common/context';
import { ReplayCache, fingerprint } from './replayCache';
import { IpLimiter } from './ipLimiter';

// 'token' = Privacy Pass mode (default). 'ip-limit' = baseline for the shared-proxy test.
let MODE = process.env.GATEWAY_MODE ?? 'token';
const mode = publicVerif.BlindRSAMode.PSS;

async function loadIssuerKey(): Promise<Uint8Array> {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(ISSUER_URL + PRIVATE_TOKEN_ISSUER_DIRECTORY);
      const dir = (await r.json()) as any;
      return new Uint8Array(Buffer.from(dir['token-keys'][0]['token-key'], 'base64url'));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('issuer not reachable');
}

// The gateway only ever holds the issuer PUBLIC key.
const issuerKeyBytes = await loadIssuerKey();
const issuerKey = await importIssuerKey(issuerKeyBytes);
const origin = new publicVerif.Origin(mode, [ORIGIN_NAME]);
let cache = new ReplayCache();
let limiter = new IpLimiter(3, 60_000);
const seenIps = new Set<string>();

function sha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(bytes).digest());
}

async function forward(path: string, res: express.Response) {
  try {
    const up = await fetch(`http://127.0.0.1:${PORTS.origin}${path}`);
    res.status(up.status).send(await up.text());
  } catch {
    res.status(502).json({ error: 'ORIGIN_UNREACHABLE' });
  }
}

const app = express();

// Lab-only control endpoints used by ReplayLab (reached directly, not through the proxy).
app.post('/__lab/mode/:m', (req, res) => {
  const m = req.params.m;
  if (m !== 'token' && m !== 'ip-limit') {
    res.status(400).json({ error: 'BAD_MODE' });
    return;
  }
  MODE = m;
  cache = new ReplayCache();
  limiter = new IpLimiter(3, 60_000);
  seenIps.clear();
  console.log(`--- lab: switched to ${MODE} mode, state reset ---`);
  res.json({ mode: MODE });
});

app.get('/__lab/stats', (_req, res) => {
  res.json({ mode: MODE, distinctSourceIps: [...seenIps] });
});

app.use(async (req, res) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  const clientId = req.header('x-client-id') ?? '-';
  seenIps.add(ip);

  if (MODE === 'ip-limit') {
    const allowed = limiter.allow(ip);
    console.log(`[ip-limit] ${allowed ? 'ALLOWED' : 'BLOCKED'} ip=${ip} client=${clientId}`);
    if (!allowed) {
      res.status(429).json({ error: 'RATE_LIMITED' });
      return;
    }
    await forward(req.originalUrl, res);
    return;
  }

  const challenge = challengeFor(req.path);
  const challengeHeader = new WWWAuthenticateHeader(challenge, issuerKeyBytes).toString();
  const auth = req.header('authorization');

  if (!auth) {
    console.log(`CHALLENGE path=${req.path} ip=${ip} client=${clientId}`);
    res.status(401).set('WWW-Authenticate', challengeHeader).json({ error: 'TOKEN_REQUIRED' });
    return;
  }

  const fail = (error: GatewayError) => {
    console.log(`REJECTED ${error} path=${req.path} ip=${ip} client=${clientId}`);
    res.status(401).set('WWW-Authenticate', challengeHeader).json({ error });
  };

  let token;
  try {
    token = AuthorizationHeader.parse(TOKEN_TYPES.BLIND_RSA, auth)[0].token;
  } catch {
    return fail('INVALID');
  }

  // Check 1: signature
  let signatureOk = false;
  try {
    signatureOk = await origin.verify(token, issuerKey);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return fail('INVALID');

  // Check 2: context (origin + path)
  const expectedDigest = sha256(challenge.serialize());
  if (Buffer.compare(Buffer.from(token.authInput.challengeDigest), Buffer.from(expectedDigest)) !== 0) {
    return fail('WRONG_CONTEXT');
  }

  // Check 3: replay cache (only valid, correctly scoped tokens are stored)
  const fp = fingerprint(token.serialize());
  if (!cache.checkAndStore(fp)) return fail('REPLAYED');

  console.log(`ACCEPTED path=${req.path} ip=${ip} client=${clientId} fp=${fp.slice(0, 12)}`);
  await forward(req.originalUrl, res);
});

app.listen(PORTS.gateway, '127.0.0.1', () => console.log(`gateway (${MODE} mode) listening on ${PORTS.gateway}`));
