# PWA implementation plan

PWA replacement and AppSheet retirement are complete for the owner-accepted scope. See [current progress](PWA_Progress.md) and [the Open release](Release_Tracker.md#current-development-release).

1. Define the requested behavior and affected PWA/API/SQL/agent components.
2. Implement the smallest coherent change.
3. Select checks by financial, access, data and UI impact under [delivery policy](PWA_Orchestration.md).
4. Validate in DEV when runtime proof is needed; reuse valid evidence.
5. Promote the pinned tested package when authorized, run one bounded smoke and update owning records.

No AppSheet coexistence, editor parity, RC copies or cutover phases remain. Reporting, monitoring and infrastructure checks apply only when affected.