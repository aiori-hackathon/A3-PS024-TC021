import { createHash } from 'node:crypto';
import { TokenChallenge, TOKEN_TYPES } from '@cloudflare/privacypass-ts';
import { ISSUER_NAME, ORIGIN_NAME } from './contract';

// The challenge is bound to the origin AND the requested path, so a token
// issued for one resource is rejected as WRONG_CONTEXT on another.
export function challengeFor(path: string, originName: string = ORIGIN_NAME): TokenChallenge {
  const context = new Uint8Array(createHash('sha256').update(`${originName}:${path}`).digest());
  return new TokenChallenge(TOKEN_TYPES.BLIND_RSA.value, ISSUER_NAME, context, [originName]);
}
