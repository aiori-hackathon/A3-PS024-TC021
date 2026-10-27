import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

// Creates a fresh origin secret each time the system starts (same idea as the
// issuer key, which is also regenerated on every start). Never committed.
mkdirSync(new URL('../keys/', import.meta.url), { recursive: true });
writeFileSync(new URL('../keys/origin.secret', import.meta.url), randomBytes(32).toString('hex'));
console.log('origin secret created');
