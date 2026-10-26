# Pseudocode (matches the implemented prototype)

~~~text
ISSUER (src/issuer/server.ts)
  startup:
    issuerKey = generate RSA-2048 key pair        # private key stays in memory only
    serve GET /.well-known/private-token-issuer-directory -> public key (token type 2)
  on POST /token-request (blinded request):
    tokenResponse = blindSign(issuerPrivateKey, blindedMessage)
    log time and client IP                        # issuer never sees the final token
    return tokenResponse

CLIENT (src/client/lib.ts)
  getToken(path):
    response = GET gateway + path                 # no token yet
    expect 401 with WWW-Authenticate: challenge + issuer public key
    (blindedRequest, state) = blind(challenge, issuerPublicKey)
    tokenResponse = POST issuer /token-request (blindedRequest)
    token = unblind(tokenResponse, state)
    return token
  redeem(path, token):
    GET gateway + path with Authorization: PrivateToken token=...

GATEWAY (src/gateway/server.ts)
  startup: fetch issuer PUBLIC key (the gateway never holds a private key)
  on request(path, authorization):
    challenge = makeChallenge(originName, path)   # bound to origin AND path
    if no authorization:                            return 401 + challenge
    token = parse(authorization)                    # unparseable -> 401 INVALID
    if not verifySignature(token, issuerPublicKey): return 401 INVALID
    if token.challengeDigest != sha256(challenge):  return 401 WRONG_CONTEXT
    fp = sha256(token)
    if not replayCache.checkAndStore(fp):           return 401 REPLAYED
    forward request to origin                       # 200

REPLAY CACHE (src/gateway/replayCache.ts)
  checkAndStore(fp):                              # one synchronous step, so atomic
    remove expired entries
    if fp in cache and not expired: return false  # replay
    cache[fp] = now + TTL
    return true                                   # first use
~~~
