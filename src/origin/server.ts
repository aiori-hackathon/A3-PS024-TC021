import express from 'express';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { PORTS } from '../common/contract';

// Origin secret: separate from the issuer key, never committed.
// Only the gateway holds a copy, so the origin only serves forwarded requests.
const originSecret = readFileSync(new URL('../keys/origin.secret', import.meta.url), 'utf8').trim();

function secretOk(header: unknown): boolean {
  if (typeof header !== 'string') return false;
  const a = Buffer.from(header);
  const b = Buffer.from(originSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const app = express();

app.use((req, res) => {
  if (!secretOk(req.headers['x-origin-secret'])) {
    res.status(403).json({ error: 'FORBIDDEN', detail: 'origin only accepts requests forwarded by the gateway' });
    return;
  }
  res.send(`protected content for ${req.path}`);
});

app.listen(PORTS.origin, '127.0.0.1', () => console.log(`origin listening on ${PORTS.origin}`));
