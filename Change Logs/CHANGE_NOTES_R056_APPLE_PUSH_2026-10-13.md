# R056 — Apple push registration fix

13 October 2026. Owner requested fixing Lisa's production notification enrollment. Five POST `/api/notifications/subscriptions` HTTP 400 failures occurred at 11:25–11:26 UTC while push configuration/status requests succeeded. Rejected payloads were not recorded, so the precise field failure is not proven. Confirmed compatibility defect: API transport validation and SQL V88 admit only `web.push.apple.com`, whereas Apple documents `*.push.apple.com`.

Scope: matching DNS-subdomain checks in registration and delivery, V91 function replacement preserving actor/ownership/ACL/cryptographic checks; relevant positive/negative tests. No frontend, payment, scheduler or account-policy changes. Paused Phase 2 files excluded from the clean candidate. Baseline app `0edd565`; PM `8ac39d9e`.

Candidate: isolated worktree; focused checks and one disposable database suite. F prepares protected current-V90 backup/recovery, DEV first and exact production migration plus command/notification image updates. Production authority: owner's request to fix this incident. No forced push or financial test. Delivery/readback pending; Lisa must retry enrollment after delivery.

[Apple endpoint requirements](https://webkit.org/blog/13878/).
