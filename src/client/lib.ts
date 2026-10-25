import {
  publicVerif,
  WWWAuthenticateHeader,
  AuthorizationHeader,
  sendTokenRequest,
} from '@cloudflare/privacypass-ts';
import { ISSUER_URL, GATEWAY_URL } from '../common/contract';

// Ask the gateway for a path, read its 401 challenge, get a token from the issuer.
export async function getTokenFor(path: string, base: string = GATEWAY_URL): Promise<AuthorizationHeader> {
  const res = await fetch(base + path);
  const header = res.headers.get('www-authenticate');
  if (res.status !== 401 || !header) {
    throw new Error(`expected a 401 challenge, got ${res.status}`);
  }
  const parsed = WWWAuthenticateHeader.parse(header)[0];
  // One Client object per token: it keeps blinding state between the two steps.
  const client = new publicVerif.Client(publicVerif.BlindRSAMode.PSS);
  const tokenRequest = await client.createTokenRequest(parsed.challenge, parsed.tokenKey);
  const bytes = await sendTokenRequest(tokenRequest.serialize(), `${ISSUER_URL}/token-request`);
  const token = await client.finalize(client.deserializeTokenResponse(bytes));
  return new AuthorizationHeader(token);
}

export async function redeem(
  path: string,
  auth: AuthorizationHeader | string,
  base: string = GATEWAY_URL,
  clientId = 'client-1'
) {
  const value = typeof auth === 'string' ? auth : auth.toString();
  const res = await fetch(base + path, { headers: { Authorization: value, 'X-Client-Id': clientId } });
  return { status: res.status, body: await res.text() };
}
