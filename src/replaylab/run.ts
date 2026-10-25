import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTokenFor, redeem } from '../client/lib';
import { GATEWAY_URL } from '../common/contract';

type Row = { name: string; expected: string; actual: string; pass: boolean };
const rows: Row[] = [];

function errOf(body: string): string {
  try {
    return JSON.parse(body).error ?? body;
  } catch {
    return body;
  }
}

function describe(r: { status: number; body: string }): string {
  return r.status === 200 ? '200 OK' : `${r.status} ${errOf(r.body)}`;
}

function record(name: string, expected: string, actual: string) {
  rows.push({ name, expected, actual, pass: expected === actual });
}

// 1. No token at all
const none = await fetch(GATEWAY_URL + '/resource');
record('No token', '401 TOKEN_REQUIRED', describe({ status: none.status, body: await none.text() }));

// 2 and 3. Valid token, then the same token again
const a = await getTokenFor('/resource');
record('Valid token', '200 OK', describe(await redeem('/resource', a)));
record('Reused token', '401 REPLAYED', describe(await redeem('/resource', a)));

// 4. Wrong context: issued for /resource, presented at /other
const b = await getTokenFor('/resource');
record('Wrong context (other path)', '401 WRONG_CONTEXT', describe(await redeem('/other', b)));

// 5. Tampered token
const c = (await getTokenFor('/resource')).toString();
const i = c.length - 10;
const tampered = c.slice(0, i) + (c[i] === 'A' ? 'B' : 'A') + c.slice(i + 1);
record('Tampered token', '401 INVALID', describe(await redeem('/resource', tampered)));

// 6. Malformed Authorization header
record('Malformed header', '401 INVALID', describe(await redeem('/resource', 'PrivateToken token=AAAA')));

// 7. Two simultaneous redemptions of one token: exactly one must win
const d = await getTokenFor('/resource');
const [x, y] = await Promise.all([redeem('/resource', d), redeem('/resource', d)]);
record('Concurrent redemption of one token', '200 OK + 401 REPLAYED', [describe(x), describe(y)].sort().join(' + '));

// Print and save the results
console.log('');
rows.forEach((r, n) =>
  console.log(`${n + 1}. ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n     expected: ${r.expected}\n     actual:   ${r.actual}`)
);
const passed = rows.filter((r) => r.pass).length;
console.log(`\n${passed} of ${rows.length} scenarios passed`);

const md = [
  '# ReplayLab test results',
  '',
  `Run: ${new Date().toISOString()}`,
  '',
  '| # | Scenario | Expected | Actual | Result |',
  '|---|---|---|---|---|',
  ...rows.map((r, n) => `| ${n + 1} | ${r.name} | ${r.expected} | ${r.actual} | ${r.pass ? 'PASS' : 'FAIL'} |`),
  '',
  `${passed} of ${rows.length} scenarios passed.`,
  '',
].join('\n');
const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs');
mkdirSync(docsDir, { recursive: true });
writeFileSync(join(docsDir, 'test-results.md'), md);
console.log('saved docs/test-results.md');
process.exitCode = passed === rows.length ? 0 : 1;
