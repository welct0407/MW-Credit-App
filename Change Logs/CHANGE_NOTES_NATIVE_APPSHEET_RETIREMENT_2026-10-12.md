# R053 agent AppSheet runtime retirement

Owner scope expansion, 12 October 2026: remove all active AppSheet runtime dependencies by release completion, starting with the integration agent. Baseline clean source e8f43d5adcfacdbe5198f56a7e6e330766cdbd07; deployed source remains separately pinned. No live configuration change is made by this implementation batch. Existing package/configuration and PostgreSQL recovery procedures remain required for deployment.

## Receipt facts slice

`review_proposal.py` now obtains label ingredients alongside the existing fixed SQL loan facts: borrower name/description, original principal, loan date and original interest rate. Its native formatter follows MW-Credit-App `services/payment-command/draft.mjs:paymentLoanDisplayKey`; there is no AppSheet Loans Find or 100-loan label truncation. Missing borrower linkage, invalid date/nonfinite or out-of-safe-range amount fails closed. Temporary label ingredients are removed so financial proposal structure is unchanged.

`review_cycle.py` compares fresh facts using a narrowly bounded display migration: only `loan_key` and `loan_keys` may normalize through an unambiguous identical loan-ID mapping. All other physical facts, borrower/account/receipt/action/approval fields must be identical. Saved proposal JSON is never rewritten; duplicate/ambiguous identity or any non-label difference does not preserve approval. Existing POSTING/UNKNOWN branches remain untouched and do not replay.

`tests/test_native_receipt_facts.py`: 3 focused tests pass, including native JS formatter golden output, one fixed SQL snapshot, missing-parent refusal and immutable label-only approval comparison. Existing `test_partner_review.py`: 21 pass. These local checks do not prove live SQL grants, actual legacy label parity for every historical receipt, or completed retirement.

## Remaining implementation

Remaining active dependencies identified: conversation Find/filter/Add/Edit/Delete transport and readback; private AppSheet-derived schema/bootstrap and app-ID configuration; partner conversation tool/system instructions; unattempted pre-cutoff legacy receipt posting. A is defining the workload-auth native catalogue/query/command facade, typed bounded filters, full action/default/virtual coverage and historical UNKNOWN native readback. Existing scoped reviewer DML remains a reviewed atomic/gap route, not a blanket SQL gateway. Operational legacy probe/recovery references are historical evidence and are not deleted solely to remove search matches.

Status: first slice implemented, broader retirement incomplete. Publication and consolidated verification coordinated with root/D. Rollback is source restoration before activation; no journal/schema rollback or new tables/columns in this slice.

## Native transport/probe boundary

Added conversation_api.py with fixed workload-auth native routes, environment/origin/audience/manifest pins, a single bounded attempt and status-only GET support. It never retries/falls back to AppSheet or SQL. config.py validates its separately disabled-by-default configuration. cli.py adds native-api-probe with explicit config/catalogue/scope and a manifest-verified one-row Partners key-only query; stdout exposes no actor/record/token values. Focused transport/probe3 and existing config6 tests pass. Server catalogue and conversation adaptation are still in progress, so the new collector command must not be activated yet; D owns that handoff.

## Native creation defaults

Root added `conversation_defaults.py` and `tests/test_conversation_defaults.py`: bounded native queries resolve the reviewed account/holder defaults, current borrower/loan/charge relationships, latest statement date and request-token values. Exact retained business-holder keys are preserved; ambiguous default accounts fail instead of choosing an arbitrary row. Caller-supplied null/false/zero remain unchanged. Only missing mapper-requested fields are resolved, stable keys use the already allocated request UUID, and no AppSheet/SQL fallback or formula interpreter exists. The command mapper must still validate write permission and persist these resolved inputs before dispatch; uncertain attempts must never recompute them.

Nine focused synthetic-provider tests pass, including default ambiguity, inactive preferred-account fallback, ledger exclusion, account-holder dependency, immutable IDs and bounded date overflow. These are source tests, not proof of live database bindings or finished integration. C independent review and B mapper integration are pending. Same baseline/source rollback above applies; no live writes were performed. Monitoring/Grafana replacement is owner-deferred, including accepted temporary monitoring failure, and is not a gate for this business API transition.

## Integrated source refinement

The earlier remaining-dependency inventory is dated. Conversation schema/bootstrap now uses the independently authorized native catalogue and pinned manifest, with typed query transport and no AppSheet app-ID/export requirement. Native commands persist their full resolved typed request before dispatch in the existing PostgreSQL journal; uncertainty uses the same request status only, never fallback or resubmission. Existing bounded reviewer DML remains a distinct declared route. Root separately removed unattempted receipt AppSheet posting; legacy attempted identities remain exact readback-only (see the receipt transport change log).

The field mapper now covers ordinary generic payment creation, unposted allocation CRUD, posted allocation interest move through its parent payment, payment correction/deletion, own cash-statement preferences, assessment refresh and loan/quick-payment semantic requests. It preserves source Created At/bank reference for generic creation, current version/head for corrections, current-day non-reused quick tokens and actor-owned attribution. Obsolete token storage is not fabricated: readback reports the immutable native effect and verifies posted payment effects where applicable. Meaningful unsupported mappings still fail explicitly and remain release work, not retired capabilities.

Six focused mapper tests pass. Root native default resolver is integrated before durable intent, with ten tests; explicit null/false/zero are preserved. Legacy conversation fixture adaptation and independent integrated verification remain pending. No live agent configuration or service flags are changed. Monitoring is explicitly deferred, so the native diagnostic probe is not an activation gate.

## Focused candidate handoff

The native conversation fixtures now run with executable AppSheet Find/HTTP tripwires and no old app IDs, keys or schema file. Discovery, typed reads, durable command intent and status-only recovery pass; the configuration test also starts native conversation configuration without AppSheet dependencies. Conversation tests: 25 passed and one existing Linux process-lock test skipped on Windows. Native transport4, mapper6 and configuration7 pass. Existing reviewer DML pure checks5 pass; fourteen database-dependent cases were skipped here and are not claimed as SQL proof. Generic source timestamp edits use the architect-approved narrow payment.update-metadata operation, preserving Created By and financial revision head; Processed At remains engine-owned.

SERVICE_CATALOGUE.md and service-catalogue.json now agree on revision27 candidate, retaining all existing service flags. config.example.json adds only disabled native endpoint/audience/environment/manifest fields. Current conversation and receipt documents distinguish deployed historical cutover from this unactivated candidate. Quick tokens retain cross-message no-replay through durable token fingerprints and exact historical r008 key reads; no old financial attempt is reinterpreted. Independent actual SQL and final consolidated verification remain prerequisites to activation.

Notification scope is unchanged for expert reviewer DML: that direct SQL route relies on durable capture/minute recovery, while native API operations request postcommit dispatch centrally. No agent dispatch endpoint/IAM hook was added.

## Linux checkpoint workflow

Added `.github/workflows/ci.yml` for Python 3.13 on Ubuntu, installing the existing package and its pinned project dependencies before `python -m unittest discover -s tests -v`. PR opened/synchronize/reopened, main push and manual dispatch share cancellable concurrency; PR checkout uses its exact head. Official checkout v4 and setup-python v5 commit pins were verified against their upstream tag refs. Permissions are contents-read only, checkout credentials are not persisted, and no deploy, secrets, live database or live Debian test route is configured.

Existing PostgreSQL lab tests still skip without their explicit disposable fixture variables; font/renderer-dependent cases retain their existing prerequisites. Those skips do not replace separately recorded SQL evidence. This source-only workflow has static validation only; publication and execution wait for the coordinated final checkpoint. Rollback is removal of this workflow at the preceding source pin; runtime configuration and journals are unchanged.
# Consolidated candidate checkpoint

The owner authorized CI and subsequent controlled promotion. The native conversation/receipt candidate and Linux test workflow are being published together for one coordinated checkpoint with the PWA API/V90 candidate. Earlier handoff statements are dated; final independent evidence is owned by `MW-Credit-App/outputs/r053-appsheet-retirement/independent-verification.md`. Linux discovery retains explicit private-database/renderer prerequisite skips and does not test against live Debian. CI outcomes and deployment are pending; no live configuration or journal changes occur in this source publication. Monitoring remains owner-deferred.


## Controlled deployment preparation
Owner authorized CI, DEV deployment and production promotion. `scripts/deploy-native-conversations.py` reuses the existing quiesce/package/config backup, immutable install, and resume procedure with a separate `r053-native-current` recovery pointer. Exact private commit/manifest/probe-Partner input binds revision26 to27, preserves existing service flags and every receipt/conversation cutoff, and requires both native read scopes plus receipt status OIDC proof before resuming timers. No financial command or outbound test message. Two focused deployment tests pass for preservation, wrong-pin/target rejection, and read-only probe failure containment. No live deployment claimed.
