export type GatewayError = 'INVALID' | 'REPLAYED' | 'WRONG_CONTEXT';

export const PORTS = {
  issuer: 3001,
  gateway: 3002,
  origin: 3003,
  proxy: 3004,
} as const;
