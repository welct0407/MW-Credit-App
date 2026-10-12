# R052 checkpoint 4G — DEV command activation

Deployment applied and the bounded real-owner synthetic receiving proof passed. Owner acceptance remains separate. DEV is V79 with stable full application capability and guarded runtime membership. Separate command revision `mw-credit-app-command-dev-00001-24p` uses immutable tested source 9a67365 / image 8ed32; actual IAM bootstrap, health 200 and anonymous 401 passed. DEV Hosting 100e5044b9227d7a is active. The reader is unchanged; PROD remains V77 and untouched.

[Exact deployment/source/CI/recovery manifest](deployment-verification-4g.json) · [Independent local 23-case evidence](independent-verification-4g.json) · [Single delivery batch](https://github.com/welct0407/AppSheet-Loan-Project/blob/codex/pwa-implementation-plan/outputs/r052-pwa/checkpoint-4g-batch.md).

Only the reviewed synthetic R052-4G borrower/loan/charges/dedicated account may post. The retained synthetic loan cash out 2 and Posted receipt cash in 2 reconcile to net zero, with one journal/payment, two allocations/repayments, paid charges and normal loan closure. All six existing affected table fingerprints are unchanged after posting. No real financial record edits, notifications or production operation. AppSheet receipt mapping proof is reused unchanged; actual deployed owner-authenticated PNG upload/GET/render passed in [C live UI evidence](live-ui-verification-4g.json). Live after-Posted replay/status has no supported UI control and was not exercised; no new AppSheet render is claimed.

## Historical verified checkpoint 4F

Stable DEV application capability, journal/API hardening and immutable receipt adapter are implemented and independently verified. Live DEV/PROD remain V77. No grants, migration, command service deployment or production operation has occurred.

[Actual receipt compatibility evidence](receipt-compatibility-4f.json) records the bounded owner CLI/live AppSheet synthetic PNG roundtrip, exact known-native readback, protected-state/reference recovery, authorized synthetic timestamp effect and exact-generation cleanup. This proves exact manual path compatibility; it does not prove deployed command-service IAM or authenticated PWA transport. `infrastructure/dev/command-identity.tf` validates with pinned providers and defaults disabled.

The final 4F runner is `tests/integration/Run-DevAppCapability.ps1`, using fresh loopback PostgreSQL and V1–V79. Focused integration passed 23/23 and corrected-source pure recovery validation passed 3/3: 26 unique named cases. [C evidence](independent-verification-4f.json) explicitly reuses unchanged valid-input integration after the narrow recovery-input fix; repeated/interim runs are not added. [Maintained database CI](database-ci-4f.json) passed separately on unchanged migration/runner hashes. Hook proof is actual disposable client execution plus maintained source inspection, not a live CLI run. [Owning change record](../../Change%20Logs/CHANGE_NOTES_R052_DEV_APPLICATION_CAPABILITY_2026-10-08.md). A design and D authority plan are in the PM repository at `outputs/r052-pwa/checkpoint-4f-design-and-test-plan.md` and `outputs/r052-payment-command-api/infra-authority-4f.md`.

Exact candidate [ff6caa8](https://github.com/welct0407/MW-Credit-App/commit/ff6caa8b9d9ff1e9b98abba17717893a01ee5661) passed [Development checks](https://github.com/welct0407/MW-Credit-App/actions/runs/37735870561) and [Database migrations](https://github.com/welct0407/MW-Credit-App/actions/runs/37735870595); [source CI record](source-ci-4f.json). Final evidence/documentation commits preserve tested source.

## Historical verified checkpoint 4E

Isolated local HTTP candidate against fresh loopback-only PostgreSQL with full V1–V78 history. No live database, real Firebase login, deployed endpoint, GCS operation or notification.

Run from the app repository using the maintained toolchain:

```powershell
. ./scripts/Enter-Dev.ps1
./tests/integration/Run-PaymentCommandApi.ps1
```

The runner owns its ephemeral port/data directory, runs both B and C test files and stops its disposable cluster. Do not substitute a live DSN or arbitrary cluster. `services/payment-command` exports candidate factories only; it is not imported by the live reader/PWA and has no cloud launcher.

Maintained database CI passed once (exit 0); see database-ci.json. Final API tests passed 22/22 (C 19 and B 3); pure contracts passed 5/5. [Test report](test-report.md) and [C's independent verification](independent-verification.json) record the final assertions and limits. Authentication uses injected synthetic verifier claims; transaction effects are actual disposable SQL. Receipt descriptors are synthetic and no AppSheet/GCS reference conversion is proved. Prior 4D restart evidence is retained separately and is not relabelled as a new 4E restart test.

A design/test plan and D future authority proposal live in the PM repository at `outputs/r052-pwa/checkpoint-4e-design-and-test-plan.md` and `outputs/r052-payment-command-api/infra-authority-plan.md`. See the owning `Change Logs/CHANGE_NOTES_R052_LOCAL_COMMAND_API_2026-10-08.md` for scope, recovery and final closeout.

Exact candidate source `20ad195017a4476ab7655f85b5f7265f15a68699` passed [Development checks](https://github.com/welct0407/MW-Credit-App/actions/runs/37730466738) and [Database migrations](https://github.com/welct0407/MW-Credit-App/actions/runs/37730466768); [source CI record](source-ci.json). Final evidence-only commits preserve candidate code.
