# Threat model and unlinkability analysis

## System and trust boundaries

Components: client, issuer, gateway, origin (all run locally in the lab), plus an optional shared proxy that simulates many clients behind one egress IP.

- Token type: RFC 9578 Type 2, publicly verifiable (Blind RSA, RSABSSA-SHA384-PSS-Deterministic), using @cloudflare/privacypass-ts 0.9.0. No new cryptography is implemented.
- The issuer private key exists only in the issuer process memory and is never written to disk. The gateway and origin only ever hold the issuer public key.
- Challenges are bound to the origin name and the requested path.

## Threats and how the prototype responds

| Threat | Response in the prototype | Evidence |
|---|---|---|
| Token replay (reuse of a spent token) | Gateway replay cache stores a SHA-256 fingerprint of each accepted token with an expiry; the check-and-store is one synchronous step | ReplayLab scenarios 3 and 7 (including two simultaneous redemptions) |
| Forged or tampered token | Signature verified with the issuer public key before anything else | Scenarios 5 and 6 |
| Token used on a different resource | The token carries a digest of the challenge (origin plus path); the gateway compares it with the expected digest | Scenario 4 |
| Issuer and gateway linking issuance to redemption | Blind signature: the issuer sees only a blinded message and never the final token; the gateway never sees the issuance request | Protocol property of RFC 9576 and RFC 9578 |
| Innocent clients blocked behind a shared IP | Decisions are made per token, not per source address | docs/shared-proxy-results.md |
| Cache growth | Expired fingerprints are swept; entries hold only a fingerprint and an expiry time | gateway/replayCache.ts |
| Issuer key exposure | Private key stays in issuer memory; public key only is served at the directory endpoint | issuer/server.ts, gateway/server.ts |

## Unlinkability assumptions

- The issuer and the gateway do not combine extra data (timing, IP logs) to match issuance events to redemptions.
- The anonymity set is large enough. With few clients, or one client per issuer key, volume and timing can single a client out.
- Issuance and redemption by the same client should not happen at nearly the same moment from the same address, or timing can link them.
- Only one issuer key is active, so tokens do not split users into groups by key.

## What Privacy Pass does not do (stated limits)

- It does not hide transport-layer IP addresses. The gateway still sees the source address (the proxy address in the shared-proxy test), and the proxy sees every client.
- It does not provide guaranteed sliding-window anonymous quotas.
- It introduces no new cryptography.
- ARC is out of scope.

## Known limitations of this lab prototype

- Replay cache is in memory with a 5 minute TTL, and tokens have no expiry of their own. A spent token could be accepted again after its fingerprint expires or after the gateway restarts, unless the issuer key has changed. Mitigations: keep fingerprints at least as long as the token validity window, add an epoch to the redemption context, or use a persistent store.
- The issuer signs any well-formed request. A real deployment needs an eligibility check (attestation or issuer-side policy) before issuing.
- The issuer key is regenerated on every issuer start, so tokens from an earlier run stop working. This is acceptable for a lab.
- Requests carry an X-Client-Id label so test output can be attributed to clients. The gateway logs it but never uses it for decisions; it exists only for the test and must not exist in a real deployment, because it would defeat unlinkability.
- Latency was measured on localhost on one machine, so real network delay is not included.
