import {
  publicVerif,
  TokenChallenge,
  TOKEN_TYPES,
  sendTokenRequest,
  PRIVATE_TOKEN_ISSUER_DIRECTORY,
} from '@cloudflare/privacypass-ts';
import { ISSUER_NAME, ORIGIN_NAME, ISSUER_URL } from '../common/contract';
import { importIssuerKey } from '../common/keys';

const dirRes = await fetch(ISSUER_URL + PRIVATE_TOKEN_ISSUER_DIRECTORY);
const dir = (await dirRes.json()) as any;
const publicKeyBytes = new Uint8Array(Buffer.from(dir['token-keys'][0]['token-key'], 'base64url'));
const issuerUrl = new URL(dir['issuer-request-uri'], ISSUER_URL).toString();

const challenge = new TokenChallenge(
  TOKEN_TYPES.BLIND_RSA.value,
  ISSUER_NAME,
  new Uint8Array(0),
  [ORIGIN_NAME]
);

// One Client object per token: it keeps blinding state between the two steps.
const client = new publicVerif.Client(publicVerif.BlindRSAMode.PSS);
const tokenRequest = await client.createTokenRequest(challenge, publicKeyBytes);
const responseBytes = await sendTokenRequest(tokenRequest.serialize(), issuerUrl);
const token = await client.finalize(client.deserializeTokenResponse(responseBytes));

const origin = new publicVerif.Origin(publicVerif.BlindRSAMode.PSS, [ORIGIN_NAME]);
const issuerKey = await importIssuerKey(publicKeyBytes);
console.log('token valid:', await origin.verify(token, issuerKey));
