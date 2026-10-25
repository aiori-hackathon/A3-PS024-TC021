# Shared-proxy test results

Run: 2026-10-25T17:32:33.423Z

Setup: 5 clients send requests through one proxy (port 3004), so the gateway sees a single source address. Baseline limit: 3 requests per minute per IP.

## Run A: IP-based rate limiting (baseline)

| Client | Outcome |
|---|---|
| client-1 | ALLOWED (200) |
| client-2 | ALLOWED (200) |
| client-3 | ALLOWED (200) |
| client-4 | BLOCKED (429) |
| client-5 | BLOCKED (429) |

Source addresses seen by the gateway: 127.0.0.1

Legitimate clients blocked: 2 of 5

## Run B: Privacy Pass tokens

| Client | Outcome |
|---|---|
| client-1 | ACCEPTED (200) |
| client-2 | ACCEPTED (200) |
| client-3 | ACCEPTED (200) |
| client-4 | ACCEPTED (200) |
| client-5 | ACCEPTED (200) |

Replay attempt by client-2 with an already spent token: 401 REPLAYED

Source addresses seen by the gateway: 127.0.0.1

## Conclusion

With one shared egress address, the IP limiter blocked legitimate clients, while the token gateway decided per token and accepted every client once. The gateway still sees the proxy source address: Privacy Pass does not hide transport-layer IP addresses.
