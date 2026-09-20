# Receipt summary agent — 21 September 2026

## Scope and authorization

Owner requested restoring Instagram-triggered borrower payment receipt handling; selected Partner Email and Language Preference for summaries, not IG reviewers; expressly deferred payment creation. On 21 September the owner confirmed production promotion and population of R011 Alternative Account Number and instructed agent development to proceed. This authorizes the dedicated receipt-summary scope on the current Linux integration runtime; generic processing, borrower replies and writes remain false.

## Baseline and dependencies

- Local clean start: `651f1724fe17dbff7f53f4509c27bdba321dc144` on main.
- Installed Linux source at initial inspection: `1d8990a84eb23835a96a67cfdca553aafce49033`.
- Reference only: retired MW AI Collection `815537117341f292430bfda1af9b43c50028bd49`; its workers remain stopped.
- Verified VM `vm-mw-credit-agent`, project `clever-oasis-508610-n7`, zone `asia-southeast1-a`; loopback proxy to production `loan_manager_prod`, login `mw_integration_agent`.
- Production read-only inspection confirmed Alternative Account Number populated on two Cash Accounts, Borrowers Instagram Username / AI Collection Enabled, Payments Bank Reference, and English/ไทย Partner language values. No real data exported.
- Codex CLI 0.155.1 was installed but not authenticated. Owner requested device sign-in, initiated in the configured private Codex home. Authentication and live extraction are pending verification.

## Changes

Durable image attachment capture; dedicated fixed-query borrower/account/Partner masters; bounded Meta image fetch and structured Codex extraction; deterministic receipt checks; primary/alternative number matching including unique masks; existing Payments and local global deduplication; transactional Partner email outbox and separate 20-second timer; fresh opt-in/destination checks; unknown email replay prevention; bounded definite retries; shared OAuth refresh locking. See [receipt operations](../docs/RECEIPTS.md) for exact behavior and exception handling.

No production schema changes, Payments creation, loan allocation or accounting actions. R011 remains the released schema dependency, not a new AppSheet release. This change lives in MW Integration Agent.

## Checks and status

- Local Python unittest discovery: 41 tests passed, 2 existing Linux/font-dependent skips on Windows.
- Tests cover basic rules and negatives, disabled/ambiguous Borrower, account aliases/masks/collisions, prior Payments reference, message/image/reference retries, restart with uncertain email, bounded rejection attempts, changed delivery data, tool-control arguments, URL allowlist and old ingress migration.
- Pending: Linux installation/tests, authentication + actual synthetic extraction, activation evidence, first authentic eligible borrower receipt and delivered email review.

## Rollback

Before installation, maintained deploy script backs up live config/catalogue, installed package and every root state SQLite database using online backup + integrity check. It preserves and resumes daily statement timers. New receipt scope can be disabled independently; never rewind receipt/email journals over provider effects. The ingress addition requires keeping its explicit-column INSERT patch when rolling back the old package. No financial database rollback is needed.
