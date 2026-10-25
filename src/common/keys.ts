import { publicVerif } from '@cloudflare/privacypass-ts';

export async function importIssuerKey(publicKeyBytes: Uint8Array): Promise<CryptoKey> {
  const spki = await publicVerif.convertRSASSAPSSToEnc(publicKeyBytes);
  return crypto.subtle.importKey('spki', spki, { name: 'RSA-PSS', hash: 'SHA-384' }, true, ['verify']);
}
