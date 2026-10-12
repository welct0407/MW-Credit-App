# R053 — AppSheet retirement

12 October 2026. The owner expanded the still-incomplete R053 to remove remaining AppSheet dependencies, and explicitly retired the PWA Reporting link. This does not reopen R053 or consume R054. The existing production system remains running while the replacement batch is prepared.

## Frontend and receipt verification

- Removed the Reporting link from live DEV/PROD navigation and its unused styles. Removed the AppSheet URL requirement from runtime configuration. New builds need no Reporting URL; old pinned configuration remains readable for historical package compatibility.
- Added `verified-native-render` receipt qualification with a SHA-256 evidence reference and exact environment/storage binding. Existing receipt generation, actor, content, decoding and access checks remain enforced. Historical catalog mappings and rollback inputs remain valid; unknown references still fail closed.
- Labeled the old AppSheet capture procedure as historical reconciliation/recovery, rather than an ordinary release prerequisite. Native live rendering evidence is still required before selecting the new qualification; no new live evidence or activation is claimed here.

Affected files: `apps/pwa/src/{live-main.tsx,live-style.css,environment.ts}`, `scripts/production/build-business-candidate.mjs`, `scripts/receipts/README.md`, `services/production/business-config.mjs`, `services/receipts/dev-receipt-adapter.mjs`, and affected production build/business/receipt tests. Independent verification may refine the build sidecar and affected navigation test in the same batch.

Rollback: source baseline `ae27da21c394ff3e0b99e253c43de0baba682558`; preserve unrelated pre-existing uncommitted changes. Restore only these scoped changes if needed. No live deployment, SQL migration, receipt remapping or financial write occurred in this slice.

Checks: 12/12 production build/package checks, TypeScript no-emit and scoped whitespace checks passed. 13/13 production business/receipt checks passed, including native evidence hash and wrong binding rejection. These focused results do not claim completion of the wider agent retirement or final consolidated CI.

Independent C refinement/checks: found and fixed legacy reportingUrl still emitted in the new public sidecar; input remains immutable and legacy validator compatibility remains. Actual production builder checks3/3 passed, including frozen historical input with no emitted sidecar/runtime Reporting URL. Focused existing F13 desktop/mobile browser case2/2 passed with Reporting absent and original navigation/page/Back/pending/delete-refresh assertions intact. Native receipt qualification code review confirms evidence hash/exact bindings and unchanged actor/generation/decode safeguards; the13 receipt tests above are root's executed evidence, not a new independent run. Details and retained synthetic diagnostic purpose/review19October: `outputs/r053-appsheet-retirement/independent-verification.md`. No live data write/deployment or broad CI; B's partial backend is not published or declared complete.

## Remaining batch

See `outputs/r053-appsheet-retirement/design-test-plan.md`. Agent native catalogue/query/command and legacy recovery replacement, native monitoring, independent verification, final consolidated checkpoint, controlled delivery and documentation remain pending. Production Reporting removal has not yet been deployed.
