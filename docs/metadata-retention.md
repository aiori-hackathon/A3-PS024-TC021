# Metadata retained by issuer, client and gateway

What each party sees and keeps in this prototype.

| Party | Sees | Retains in the prototype | Cannot learn |
|---|---|---|---|
| Client | Challenge, issuer public key, its own token | Its own token (in memory) | Other clients' tokens |
| Issuer | Time of each issuance request, the client's source IP, the blinded token request, which issuer key was used | Issuance time and client IP (in memory log and console), count of issued tokens | The final token (nonce, challenge digest, signature), so it cannot recognise a token later |
| Gateway | At redemption: the full token, the challenge digest, source IP, requested path, result | Fingerprint (SHA-256 of the token) plus expiry in the replay cache; log lines with path, source IP, test label, result and the first 12 characters of the fingerprint | Which issuance request produced the token, and who the user is |
| Origin | Only requests the gateway forwarded (the path) | Nothing in the prototype | Tokens, rejected requests, the client source address (the gateway forwards without it) |
| Shared proxy (test only) | Every client's traffic and source address | Nothing | Token validity |

## Linkability notes

| Link | Possible? | Why |
|---|---|---|
| Issuance to redemption (issuer view) | Not by token | The issuer only saw the blinded request, never the token |
| Issuance to redemption (gateway view) | Not by token | The gateway sees the token but no issuance event |
| Redemption to redemption by the same client | Possible by timing or address | Tokens are single-use and unrelated, but the source address and timing are visible |
| Client identity | Possible via IP | Privacy Pass does not hide IP addresses |
| Issuer and gateway collusion | Only through side data | Matching issuance and redemption times and addresses could narrow the candidates |

## Operational overhead

- The gateway stores one fingerprint (64 hex characters) and one expiry time per redeemed token until the TTL expires.
- Issuance needs one extra round trip to the issuer per token. See docs/latency-results.md for measured costs.
