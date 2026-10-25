import express from 'express';
import {
  publicVerif,
  TOKEN_TYPES,
  MediaType,
  PRIVATE_TOKEN_ISSUER_DIRECTORY,
} from '@cloudflare/privacypass-ts';
import { PORTS, ISSUER_NAME } from '../common/contract';

const { BlindRSAMode, Issuer, TokenRequest, getPublicKeyBytes } = publicVerif;
const mode = BlindRSAMode.PSS;

// The private key lives only in this process. It is never written to disk.
const keys = await Issuer.generateKey(mode, {
  modulusLength: 2048,
  publicExponent: Uint8Array.from([1, 0, 1]),
});
const issuer = new Issuer(mode, ISSUER_NAME, keys.privateKey, keys.publicKey);
const publicKeyBytes = await getPublicKeyBytes(issuer.publicKey);

// Metadata the issuer retains (used later in the metadata-retention analysis)
const issuanceLog: { time: string; clientIp: string | undefined }[] = [];

const app = express();

app.get(PRIVATE_TOKEN_ISSUER_DIRECTORY, (_req, res) => {
  res.type(MediaType.PRIVATE_TOKEN_ISSUER_DIRECTORY).json({
    'issuer-request-uri': '/token-request',
    'token-keys': [
      {
        'token-type': TOKEN_TYPES.BLIND_RSA.value,
        'token-key': Buffer.from(publicKeyBytes).toString('base64url'),
      },
    ],
  });
});

app.post(
  '/token-request',
  express.raw({ type: MediaType.PRIVATE_TOKEN_REQUEST, limit: '16kb' }),
  async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).send('expected a token request');
        return;
      }
      const tokenRequest = TokenRequest.deserialize(TOKEN_TYPES.BLIND_RSA, new Uint8Array(req.body));
      const tokenResponse = await issuer.issue(tokenRequest);
      issuanceLog.push({ time: new Date().toISOString(), clientIp: req.socket.remoteAddress });
      console.log(`issued token #${issuanceLog.length} to ${req.socket.remoteAddress}`);
      res
        .status(200)
        .type(MediaType.PRIVATE_TOKEN_RESPONSE)
        .send(Buffer.from(tokenResponse.serialize()));
    } catch (err) {
      console.log('bad token request:', (err as Error).message);
      res.status(400).send('bad token request');
    }
  }
);

app.listen(PORTS.issuer, () => console.log(`issuer "${ISSUER_NAME}" listening on ${PORTS.issuer}`));
