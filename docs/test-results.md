# ReplayLab test results

Run: 2026-10-27T15:51:05.717Z

| # | Scenario | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | No token | 401 TOKEN_REQUIRED | 401 TOKEN_REQUIRED | PASS |
| 2 | Valid token | 200 OK | 200 OK | PASS |
| 3 | Reused token | 401 REPLAYED | 401 REPLAYED | PASS |
| 4 | Wrong context (other path) | 401 WRONG_CONTEXT | 401 WRONG_CONTEXT | PASS |
| 5 | Tampered token | 401 INVALID | 401 INVALID | PASS |
| 6 | Malformed header | 401 INVALID | 401 INVALID | PASS |
| 7 | Concurrent redemption of one token | 200 OK + 401 REPLAYED | 200 OK + 401 REPLAYED | PASS |

7 of 7 scenarios passed.
