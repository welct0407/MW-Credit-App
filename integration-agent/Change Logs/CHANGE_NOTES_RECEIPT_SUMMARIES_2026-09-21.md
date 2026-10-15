# Receipt summary agent — 21 September 2026

## Scope and authorization

Owner requested restoring Instagram-triggered borrower payment receipt handling; selected Partner Email and Language Preference for summaries, not IG reviewers; expressly deferred payment creation. On 21 September the owner confirmed production promotion and population of R011 Alternative Account Number and instructed agent development to proceed. This authorizes the dedicated receipt-summary scope on the current Linux integration runtime; generic processing, borrower replies and writes remain false.

## Baseline and dependencies

- Local clean start: `651f1724fe17dbff7f53f4509c27bdba321dc144` on main.
- Installed Linux source at initial inspection: `1d8990a84eb23835a96a67cfdca553aafce49033`.
- Reference only: retired MW AI Collection `815537117341f292430bfda1af9b43c50028bd49`; its workers remain stopped.
- Verified VM `vm-mw-credit-agent`, project `clever-oasis-508610-n7`, zone `asia-southeast1-a`; loopback proxy to production `loan_manager_prod`, login `mw_integration_agent`.
- Production read-only inspection confirmed Alternative Account Number populated on two Cash Accounts, Borrowers Instagram Username / AI Collection Enabled, Payments Bank Reference, and English/ไทย Partner language values. No real data exported.
- Codex CLI 0.155.1 was installed but not authenticated. Owner requested device sign-in, initiated in the configured private Codex home. Device sign-in completed and actual image extraction passed. No credentials copied from Windows.

## Changes

Durable image attachment capture; dedicated fixed-query borrower/account/Partner masters; bounded Meta image fetch and structured Codex extraction; deterministic receipt checks; primary/alternative number matching including unique masks; existing Payments and local global deduplication; transactional Partner email outbox and separate 20-second timer; fresh opt-in/destination checks; unknown email replay prevention; bounded definite retries; shared OAuth refresh locking. See [receipt operations](../docs/RECEIPTS.md) for exact behavior and exception handling.

No production schema changes, Payments creation, loan allocation or accounting actions. R011 remains the released schema dependency, not a new AppSheet release. This change lives in MW Integration Agent.

## Checks and status

- Local Python unittest discovery: 42 tests passed, 2 existing Linux/font-dependent skips on Windows.
- Tests cover basic rules and negatives, disabled/ambiguous Borrower, account aliases/masks/collisions, prior Payments reference, message/image/reference retries, restart with uncertain email, bounded rejection attempts, changed delivery data, tool-control arguments, URL allowlist and old ingress migration.
- Installed package from b111681; Linux suite: all 42 tests passed. Synthetic image extraction and PromptPay alias validation passed at 2026-09-21 02:49:44 Bangkok; no email or payment created. The synthetic verifier now uses Pillow bundled font after its initial external-font path was unavailable.
- Activated receipt_summary_enabled with immutable cutoff 2026-09-20T19:50:41.429637+00:00 (02:50:41 Bangkok). Generic sending, processing and writes remain false; statement schedule and fallback remain true.
- First service start exposed lazy ingress migration (attachment column was previously initialized only on POST). Applied the existing journal migration and verified integrity; next service run succeeded at 02:51:32, with empty job/outbox counts proving no historical replay. Deployment now initializes it explicitly; activation checks it before changing controls.
- Existing receiver/tunnel/proxy and both statement timers remain active; systemd receipt unit validation passed.
- Signed loopback ingress: invalid signature 403, repeated valid delivery stored once with image reference; synthetic event timestamp was pre-cutoff and generated zero jobs/emails. Both journals integrity=ok.
- Actual Codex synthetic image extraction passed under production-equivalent systemd restrictions at 02:54:01 Bangkok (5.5 seconds, about 131 MB peak). Authentication file mode verified 0600. No synthetic email or payment was sent/created.
- **Implemented and activated; first authentic eligible borrower receipt and actual Partner email review remain outstanding.** Code and deployment scripts published to main through 9ac5c69; final evidence publication follows this log update.

## Rollback

Verified private rollback snapshot: `/var/lib/mw-integration-agent/rollback/receipts-20260920T194819Z`. It contains live config/catalogue, installed package and root state SQLite online backups; integrity checks passed. It preserves and resumes daily statement timers. New receipt scope can be disabled independently; never rewind receipt/email journals over provider effects. The ingress addition requires keeping its explicit-column INSERT patch when rolling back the old package. No financial database rollback is needed.

## Conversation identity refinement — 21 September 2026

Owner instructed using the existing IG identity in the conversation/group and Borrower master, removing the separate profile-consent requirement. Schema inspection confirmed Borrowers has Instagram Username, not a numeric IG ID column. The receipt path now matches signed sender ID to the conversation participant ID and its username to the unique AI-enabled borrower. It rechecks this binding before email dispatch. No new schema, profile request, or change to statement routing.

Starting clean Git commit: 5bb3739821291543bcf38b0359e03933cdb4492d. Added tests for successful mapping without profile permission, pagination/repeated group members, missing/conflicting bindings and incomplete participant directories. Existing receipt validation, masked-account policy and email rules remain in force. Live backup, deployment and Noey retest results are recorded below after verification; retain the original activation cutoff and journals, with no historical replay or test email.
Verification: all 46 tests pass on Linux (Windows: 46 with two existing font/platform skips). Deployed f976ac30564268996cd5fa5d9a0e893b088d3e62 after verified private online SQLite/package/config backups at `/var/lib/mw-integration-agent/rollback/receipts-20260920T201735Z`. The requested real-receipt retest passed unique Borrower mapping and AI-enabled checks using conversation participant identity, without a profile call. Receipt account validation still rejects the matching master alternative because that stored number is masked; no rule was relaxed. No test email, financial write or historical replay occurred. Original cutoff 2026-09-20T19:50:41.429637+00:00 was retained. Receipt timer, ingress and both statement timers are active; receipt service Result=success / exit=0. Private detailed test evidence stays on the VM; no borrower identifiers or receipt data committed.
## Receipt transfer time — owner clarification, 21 September 2026

Starting commit b862ce47d7f0047883fbe2335f503d610d2dc26c. Reuse existing Payment Date / Created At; no new audit columns and no payment creation. The extractor returns printed transfer time, the validator rejects unreadable times, and localized summaries include the Bangkok time. Prepared fields preserve printed precision. Earlier accepted receipts without time retain their original date. Statement PNGs retain hours/minutes only, as explicitly clarified by the owner, and label the existing ledger value as transaction time. Stored receipt precision is preserved. AppSheet R013/V30 supplies the future payment-to-ledger propagation in DEV; production SQL remains V29 pending promotion. No historical financial backfill or statement replay.

Local verification: 49 tests pass, with the two existing Debian/font skips on Windows. DEV SQL source-to-ledger and statement-provider tests are recorded in AppSheet R013. Deployment, Linux/model extraction and visual verification follow below. Preserve the original receipt activation cutoff and all live journals.

Deployment verified: implementation 0e953464728b53db5e72b4f191578856a8381ada installed after private package/config/SQLite backup at /var/lib/mw-integration-agent/rollback/receipts-20260921T060150Z; journal backup integrity passed. All 49 Linux tests passed. Actual synthetic Codex extraction preserved the printed transfer time and passed validation at 13:03 Bangkok, with no mail or payment. English/Thai synthetic PNGs rendered and visually checked: hours/minutes only, readable layout. Receipt timer, ingress and both statement timers active; financial writes remain disabled. Existing receipt cutoff retained. R013 production SQL promotion is pending.
