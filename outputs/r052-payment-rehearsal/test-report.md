# R052 checkpoint 4A independent verification

Local synthetic rehearsal only, 8 October 2026. No live database calls, grants, migrations, payment endpoint, owner identity, notifications, receipt uploads or cloud deployment.

## Actual database evidence

B executed the guarded complete V1–V77 runner with six B cases and five independent C cases: 11/11 passed after fixes. C reviewed its assertions/source. The runner creates a new random loopback cluster, verifies its owned data directory/database/full history, and stops it afterward. No partial Collection fixture schema or historical live payment lab was used.

Independent cases reconcile selected principal100+200 and interest10+20 exactly as decimal strings; two allocations, two repayments and one cash entry accompany one receipt. Unselected55.00/foreign33.00/future10.00 remain unchanged; repayment actors match the trusted synthetic actor. Separate provider instances reconcile identical concurrent requests to one database effect. A deliberately lost COMMIT acknowledgment reports UNKNOWN until a fresh read finds Posted; a precommit injected failure rolls back every receipt/child/cash effect. Ordinary source correction/deletion is actually executed in the disposable database: cached original success is not reused. Known commands reconcile after a simulated Bangkok midnight; new commands with stale dates are rejected.

B's actual correction/delete test also demonstrates the expected durability gap: deleting the source receipt permits reuse of its primary key by a restarted memory journal. The journal is a simulation, not durable idempotency or retained tombstone evidence. SQL posting does not prove AppSheet event delivery.

Final combined run passed12/12 (B6+C6), including inactive account, missing actor mapping and changed residual. All rejected commands left zero receipt/repayment/allocation/cash effects; the preceding valid110 receipt remained intact. B executed this guarded run and reported normal cluster shutdown.

## Browser evidence

C launched a separate full-history guarded -Serve database and tested actual local HTTP. Desktop English review showed both dated110/220 lines, receiving account and total330. Mobile320 Thai review had no horizontal overflow; offline confirmation was disabled. One actual local confirmation deliberately lost its response after commit; UI remained UNKNOWN with frozen request ID and no second confirm, then explicit status lookup observed Posted330 through a fresh database read. Only one confirmation request and zero non-loopback requests occurred.

Separate transport simulations verified terminal conflict cannot use an ID-only lookup to claim another payload posted, and an unresponsive request reaches UNKNOWN in8.6seconds. Those simulations are not additional database posting evidence. Native iPhone Safari behavior is not claimed.

Screenshots: desktop-review-en.png, mobile-review-th.png, mobile-unknown-en.png, mobile-posted-en.png; mobile-review-th-full.png and mobile-review-th-controls.png additionally show reachable lower confirmation controls using the same synthetic fixture values without submitting. browser-results.json records observed outcomes.

Final check-status-before-retry refinement passed: unknown permits status lookup only; Retry remains disabled after both journal-missing and unavailable lookup. One synthetic submit and two status reads were observed, with no resend. The updated mobile-unknown-en.png shows this final simulated transport state. Four browser scenarios passed in total (three initial scenarios plus this focused guard verification); the reusable browser script retains the new guard assertions. Parent reviewed initial screenshots and requested that refinement plus lower controls evidence. Final freeze follows these checks; no broad unrelated PWA/auth/SQL suite is required. D owns mandatory database Test-CI and source publication.

C's used preview was stopped after verification; its runner confirmed owned PostgreSQL shutdown. The server-child termination produces runner exit1 by design of the current wrapper and is not a failing test execution. D starts a fresh fixture for owner review. D separately reports mandatory Test-CI passed; see database-ci.json and its README.
