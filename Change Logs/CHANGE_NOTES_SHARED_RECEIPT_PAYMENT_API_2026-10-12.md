# Shared receipt-payment API — 12 October 2026

Baseline: clean main `38d3739a55449a34b220119d099fa74bebf6df2e`; implementation branch `codex/r053-postcommit-notifications`. Owner-approved R053 source work; live AppSheet receipt posting and all production flags remain unchanged.

Changes: new default-off receipt_api transport, deterministic cross-language request identity, exact ARCHIVED metadata assertion, reviewed future cutoff, persisted route before network, status-only uncertainty handling and unchanged legacy recovery/readback/projector. Runtime catalogue gate, config validation/example and catalogue revision26 agree: implemented, disabled. No generic conversation path, image object or service deployment changed.

Focused verification: seven receipt-adapter tests passed (shared UUID golden vectors/default-deny, journal-before-network+readback, uncertain API no fallback, old unknown review preserved, before-cutoff approved legacy transport, recorded rejection without retry, actual valid config still denied by disabled catalogue); six config tests passed. An initial discovery accidentally imported the existing CycleTests class and executed 49 cases: 48 passed and one Linux-only fcntl case cannot run on Windows. The import was corrected; the intended focused suite passes. App SQL/API integration parity and final checkpoint remain independently coordinated; no complete Linux suite claim.

Rollback: keep switch disabled/use baseline source before activation. After any later activation, preserve persisted `pwa:` attempts and reconcile status; do not reroute them to AppSheet. Keep old credentials until legacy approved/uncertain work resolves. No live private configuration or data was copied to Git.

Status: implementation and focused tests complete; independent SQL/API/projector verification and source publication pending. No live financial writes, provider delivery or production activation.
