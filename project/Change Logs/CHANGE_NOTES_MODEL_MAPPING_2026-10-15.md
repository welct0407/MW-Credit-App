# Claude model mapping and not-applicable roles — 15 October 2026

15 October 2026 (Asia/Bangkok). Owner-requested review and revision of the Claude alternative in the PWA team mapping.

Changed: `Documents/Rules/Model_Work_Mapping.md` Claude table — A moves to Fable 5.1 / medium (escalation Fable 5.1 / high with named triggers); B moves to Opus 5.5 / high, medium for text/style/layout-only changes (escalation Fable 5.1 / medium); E moves to Opus 5.5 / medium (escalation high for new pages/flows or shared navigation/responsive effects); F moves to Opus 5.5 / medium (escalation unchanged). Fable fallback named: Opus 5.5 / high for A, Opus 5.5 / xhigh for escalated B. Orchestrator, C, D and the Codex table are unchanged. `Documents/Rules/PWA_Orchestration.md` now lets the orchestrator record a plainly excluded role as not applicable without starting a worker.

Checks: intended diff and `git diff --check`. Documentation/governance only; no product CI, deployment, release or live change. Recovery: revert this commit; baseline `0995868`.
