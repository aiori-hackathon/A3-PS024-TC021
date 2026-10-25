# Latency results

Run: 2026-10-25T17:35:40.109Z

Machine: win32 10.0.26300, AMD Ryzen 5 5600H with Radeon Graphics          (12 logical cores), Node v24.11.1

Method: 10 warm-up runs (not counted), then 100 measured runs per operation, timed with performance.now(). All services run on localhost, so network delay is not included.

| Operation | Runs | Mean (ms) | p50 (ms) | p95 (ms) | Max (ms) |
|---|---|---|---|---|---|
| Issuance (blind, issuer signs, unblind) | 100 | 293.94 | 283.84 | 371.46 | 390.10 |
| Redemption (gateway verifies and forwards) | 100 | 2.60 | 2.16 | 3.16 | 33.84 |
| Baseline: 401 challenge, no token | 100 | 0.79 | 0.76 | 0.94 | 1.59 |

Redemption failures: 0

Verification overhead (redemption mean minus no-token baseline mean): 1.81 ms

Operational overhead: issuance needs one extra round trip to the issuer, and the gateway keeps one replay-cache entry (a 64-character fingerprint plus an expiry time) per redeemed token until its TTL expires.
