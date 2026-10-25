export type GatewayError = 'INVALID' | 'REPLAYED' | 'WRONG_CONTEXT';

export const PORTS = {
  issuer: 3001,
  gateway: 3002,
  origin: 3003,
  proxy: 3004,
} as const;

export const ISSUER_NAME = 'issuer.lab.local';
export const ORIGIN_NAME = 'origin.lab.local';
export const ISSUER_URL = `http://127.0.0.1:${PORTS.issuer}`;
export const GATEWAY_URL = `http://127.0.0.1:${PORTS.gateway}`;
