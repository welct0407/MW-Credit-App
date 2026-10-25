# Change notes — Mechanical lint fixes (CI tune-up Batch 2), 25 October 2026

## Purpose
Batch 2 of the Development Checks tune-up plan, stacked on Batch 1 (`91185f3`): clear the mechanical Biome warnings so the remaining ones are only the hook, accessibility and style decisions of Batch 3. No behavior change intended.

## Changes
- 102 files: 52 in `apps/pwa/src`, 30 tests, 9 in `services`, 5 in `scripts`.
- Biome warnings 731 and 5 infos fall to 377 and 0. Cleared: `noUnusedImports` 72, `noUnusedVariables` 71, `noUnusedFunctionParameters` 50, `useButtonType` 148, `useOptionalChain` 11, `noUselessFragments` 3, `useLiteralKeys` 1, `useIndexOf` 1, `noArguments` 1 and one unused suppression. What remains is Batch 3 only: `useExhaustiveDependencies`, accessibility rules and `noImportantStyles`.
- Buttons: 8 implicit-submit buttons became `type="submit"` (`ChargeForm`, `ExpenseRecords`, `LoanClose`, `ManagementAssessments`, `ManagementFinancialForm`, `ManagementForm`, `ManagementOpenings`, `PaymentRecord`) and 140 others `type="button"`; all 14 forms were checked.
- Manual choices: Biome's `_proof` rename in `phase6-management-independent.test.mjs` was rejected (it would read a nonexistent property), so the unused name is removed from the destructuring; unused shorthand properties removed in `r053-operator-tooling.mjs` and the `UpcomingCharges` props; `manifest.mjs` `arguments[1] ?? {}` became an `options = {}` parameter; other unused variables were renamed with `_`, not deleted (for example `_original` in `payments.mjs` keeps its query).

## Checks
| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass, on `91185f3` plus this diff (Byte) |
| `npm run check` | 913 pass, 1 skipped (Byte) |
| `node --check` on the changed `.mjs` files | Pass (Byte) |
| 7 targeted specs | 338 pass, 2 skipped (Byte) |
| Integration tests on disposable loopback PostgreSQL clusters | `Run-Phase5.ps1 -JournalOnly` 85/85, `-ManagementOnly` 1/1 and 30/30, `Run-Phase8.ps1 -R053` 22/22 (Chase) |
| Chase verification | Ready, no defects. TypeScript parse: 8 in-form untyped buttons became submit and all 122 added `type="button"` are outside forms; token diff shows only unused imports, fragments, `_` renames and `?.` equivalences; `noUndeclaredVariables` clean; `manifest.mjs` equivalent (null throws in both); services and scripts behaviour unchanged. The 2 skipped specs are `foundation.spec.ts:65` and `:111`, project-conditional and unchanged from `main` (Chase) |
| Echo review of the changed flows | No blocking finding. E-B2-01 (Low): the LoanClose "Retry review" button outside the form had become `type="submit"`; Byte fixed it to `type="button"`, so 8 submit buttons in total. Static before/after parse of all changed `.tsx` and a Chromium form-semantics harness at 390 px and 1440 px (click and Enter submit, a disabled button blocks Enter, `type="button"` chips do not submit); the only CSS reading button type is `.form-sticky-actions>button[type=submit]`, unaffected. Not driven in the full app (port contention); iPhone/WebKit not applicable (Echo) |
| `npm run check:docs` | 0 failures, 0 warnings |
| Development checks (pull request) | The pull request's run on this commit |

## Not run
No full local Playwright suite (the pull request's run is the broad one). No deployment.

## Recovery
Revert the batch commit.

## Open questions
None.

## Remaining work
Chase and Echo rows above; Batch 3 (the 377 remaining warnings, owner decision of 25 October: fix with review).
