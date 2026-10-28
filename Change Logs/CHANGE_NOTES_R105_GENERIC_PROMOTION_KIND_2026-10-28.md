# Change notes — generic promotion kind (R105), 28 October 2026

## Purpose
Stop every release needing a tooling pull request before promotion. The owner asked why the release tool keeps failing on versions and said "Yes" to making it release-agnostic (28 October 2026). The 18 October (build-time release number) and 21 October (version-agnostic tests) fixes deliberately left the per-release runner kinds as fixed history, so each promotion needed its own kind; R104 needed PRs #183 and #184.

## Changes
- `scripts/promotion/deploy-business-hosting.mjs` (commit `9420a01`): new generic kind, `schemaVersion: 36`, `kindRule: generic-v1`. The operator supplies the manifest; the runner derives the baseline (previous `RNNN` tag), the contiguous migration range with sha256 from the package commit and the DEV manifest, and the changed services from each service entry point's import closure (commit `72f1b856`; a file no entry point reaches, and any other image input, changes all five); release tags come from origin and an already-tagged release is refused; generic runtime packages also supply the plan's `terraform show -json` export, re-hashed and limited to image-only updates. The plan must be images-only for exactly those services, with SQL before images. Existing kinds R059 to R104 are untouched.
- `scripts/promotion/README.md`: section "Generic release kind (R105 onwards)" with the manifest fields, the derivations and what still needs a hand-written kind.
- Tests: `tests/unit/business-hosting-delivery.test.mjs`.
- Records: `project/Documents/Rules/Release_Workflow.md` (promotion step 2 points to the README section), `project/Documents/Development_Changes.md` (promotion runner row).

## Checks
| Command | Result |
| --- | --- |
| `npx biome lint` | Pass, clean, `9420a01` and `72f1b856` (Byte) |
| `node --test tests/unit/business-hosting-delivery.test.mjs` | Pass, 125/125 at `9420a01`; 126/126 at `72f1b856` (Byte) |
| `npm test` | Pass, 976, 0 fail at `9420a01`; 977, 0 fail at `72f1b856` (Byte) |
| Adversarial review of the generic kind (Chase) | `9420a01`: one high finding, two low. High: the role map sent `services/payment-command` to command only and `services/chat` to chat only, but read, command and chat all load `services/production/business-runtime.mjs`, which imports both, so a plan could omit read and chat images and pass (the hand-written R104 kind shipped all three for such a change). Low: release-number reuse and local-only tags were not checked; `plan.actions` came from the manifest. Migration contiguity and hashes, frontend-only refusal, kind routing and R059 to R104 routing held. Re-check of `9420a01..72f1b856` (read only, no test rerun): all three fixed. Roles come from each entry point's relative-import closure (unreached files and other image inputs change all five); tags come from origin with the local-equals-origin and already-tagged refusals; the plan is read back from the saved plan and its `terraform show -json` export, limited to image-only updates of the changed services. No open findings. |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey) |

## Not run
No live promotion has used the generic kind yet; its first real use is R105's promotion.

## Recovery
Revert `9420a01` and `72f1b856`. Hand-written kinds R059 to R104 are unchanged, so a release can still be promoted with a per-release kind.

## Open questions
None.

## Remaining work
Chase's review, then the first real use in the R105 promotion.
