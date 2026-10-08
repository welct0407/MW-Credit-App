# R052 request reference and recovery verification

Independent C verification, 8 October 2026. Synthetic fixtures and local HTTP/browser servers only; no live fault injection, owner authentication, business records, or SQL changes.

## Results

- 2/2 independent actual HTTP tests passed. Eight response branches cover health, unsigned denial, bad origin, method denial, preflight, root source failure, loan detail failure and upcoming date failure. Each request receives a distinct UUIDv4, ignoring supplied IDs; body contracts stay unchanged. Completion records match response IDs exactly once and contain only the seven approved fields. Synthetic private query/record/token material is absent. Exact-origin exposure, no-store, Vary and auth-before-store behavior remain intact. A throwing logger does not change the HTTP response.
- 8/8 focused browser cases passed across desktop Chromium and mobile Chromium. Root Borrowers/Collection errors show valid references; copy success and denied clipboard access are truthful. Explicit retry preserves the applied search. Malformed/missing references and network failures render no invented reference. EN/Thai references wrap at 320px without document overflow. Child loan/charge errors retain the authorized parent and recover explicitly; upcoming-summary failure clears on summary refresh. Late child errors after route navigation do not attach to the new view.
- The final upcoming-summary addition was rerun in both projects (2/2 passed). These are affected reruns within the eight cases, not additional unique cases.

B's focused unit/build checks and A's source review are separate evidence. Existing auth/date/pagination/PWA/financial tests were not broadly repeated because those contracts are unchanged. Browser API/auth and clipboard responses here are controlled synthetic seams, not live Google sessions or native iPhone clipboard proof. No real Cloud Run log-content audit or owner-device check is claimed. Full upstream CI and ordinary deployed smoke follow publication.

## Evidence and limitations

Eight screenshots use desktop/mobile prefixes and Borrowers/Collection error-en/error-th suffixes in this directory. Parent reviewed the initial English desktop/mobile captures without a visual blocker. Actual UUIDs in screenshots are deliberately synthetic constants.

An initial browser run reached all English recovery assertions but failed the final Thai step because the test clicked the search icon sharing the refresh CSS class. The test now targets the exact Thai accessible refresh name; no product correction or timeout relaxation was required. A local Python launcher was unavailable before file creation; setup used the pinned Node runtime instead.

C changed only tests/unit/request-reference-http.test.mjs, tests/e2e/error-recovery.spec.ts and this evidence directory. No managed build artifacts or historical screenshots were overwritten. Local test servers stopped after execution. Source remains frozen for D publication; no additional product defects found.

## Deployed delivery verification

Exact source a1fc80001963cec93df65bf5d48062e6c8d13f4f passed CI37712787076. After API revision00012-99g and Hosting ff1c9ce9a4bfedf2 delivery, five bounded checks passed: both allowed origins returned unsigned401 with distinct server UUIDv4 references exposed through CORS; the untrusted origin returned403 without reference exposure. Supplied synthetic request IDs were ignored and no-store/body contracts remained intact. Fresh canonical320px and fallback1440px contexts showed signed-out EN/Thai UI with zero business API requests, no records and no overflow. Both hosts delivered exact index-DbyM5rK8.js and worker5397340c64eba86386815ba0573943986dbab140666ddcac6a63249c17ad3071.

Evidence: live-delivery.json and live-canonical-signedout-th.png / live-fallback-signedout-th.png. No login, induced server failure, business read or duplicate log-correlation probe occurred. D owns the separate benign request-to-stdout correlation. Owner authenticated recovery review remains separate from these unsigned checks.
