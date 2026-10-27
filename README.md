# AIORI-3-HACKATHON-PROJECTS
This repository will contain the code and resources for the AIORI-3 hackathon that will be developed during the AIORI-3

## Team Introduction Video
https://youtu.be/OQZYe3GTLmQ


---

## PS-024: Privacy Pass Token Issuance and Anti-Replay Gateway

Team A3-PS024-TC021: Adona Mariya Salu and Joy Aanchal Rose.

### What this project does

A lab implementation of the IETF Privacy Pass architecture (RFC 9576, 9577, 9578). A client gets a blind-signed token from an issuer and later redeems it once at an edge verification gateway in front of one controlled origin. The gateway rejects reused, invalid and wrong-context tokens using a replay cache, and keeps working when many clients share one source address.

- Token type: RFC 9578 Type 2, publicly verifiable (Blind RSA, RSABSSA-SHA384-PSS-Deterministic)
- Library: @cloudflare/privacypass-ts 0.9.0 (no new cryptography)
- Language: TypeScript on Node.js

### Architecture

| Component | Folder | Port | Role |
|---|---|---|---|
| Issuer | src/issuer | 3001 | Signs blinded token requests; private key lives only in process memory |
| Gateway | src/gateway | 3002 | Sends the challenge; checks signature, then context, then replay cache; forwards valid requests |
| Origin | src/origin | 3003 | The protected service. Accepts only requests carrying its own origin secret (separate from the issuer key); direct requests get 403 |
| Shared proxy | src/proxy | 3004 | Test only: makes all clients appear from one source address |
| Client | src/client | - | Gets the challenge, blinds, requests a token, unblinds, redeems |
| ReplayLab | src/replaylab | - | Runs all test scenarios and measurements |

Flow: the client asks the gateway for a resource and receives a 401 challenge; it gets a blind-signed token from the issuer; it retries with the token; the gateway verifies it and forwards the request. See docs/pseudocode.md.

### Requirements

Node.js 20 or newer and Git.

### Setup and run

~~~
cd src
npm install
npm run all          # starts issuer, gateway, origin and proxy (keep this terminal open)
~~~

In a second terminal, from the src folder:

~~~
npm run replaylab      # 7 scenarios: valid, reused, invalid, wrong-context, and more
npm run sharedproxy    # IP-limit baseline versus tokens through one shared proxy
npm run latency        # issuance and redemption latency (100 runs each)
npm test               # unit tests for the replay cache
~~~

Results are written to the docs folder.

### Results (measured on a Windows laptop, Node v24, all services on localhost)

| Test | Result |
|---|---|
| ReplayLab scenarios | 7 of 7 pass: no token, valid, reused, wrong context, tampered, malformed header, two simultaneous redemptions of one token |
| Shared proxy, IP limit baseline (3 per minute per IP) | 2 of 5 legitimate clients blocked |
| Shared proxy, Privacy Pass tokens | 5 of 5 accepted; a reuse attempt was rejected as REPLAYED |
| Issuance latency | mean 293.94 ms, p50 283.84 ms, p95 371.46 ms |
| Redemption latency (verify and forward) | mean 2.60 ms, p50 2.16 ms, p95 3.16 ms |
| No-token baseline (401 challenge) | mean 0.79 ms |

Numbers vary slightly between runs. Details are in docs/test-results.md, docs/shared-proxy-results.md and docs/latency-results.md.

### Documents

- docs/threat-model.md: threat model and unlinkability analysis
- docs/metadata-retention.md: what the issuer, client and gateway see and keep
- docs/pseudocode.md: pseudocode of the prototype

### Limits

- Privacy Pass does not hide transport-layer IP addresses. The gateway still sees the source address (the proxy address in the shared-proxy test).
- No guaranteed sliding-window anonymous quotas, and no new cryptography. ARC is out of scope.
- The lab issuer signs any well-formed token request. Eligibility checking (attestation) is out of scope for this prototype.
- The replay cache is in memory (5 minute TTL) and the issuer key is regenerated on every start.
- The X-Client-Id header is a test label only; the gateway never uses it for decisions.
