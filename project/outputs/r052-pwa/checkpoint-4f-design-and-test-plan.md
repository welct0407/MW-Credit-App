# R052 checkpoint 4F — stable DEV application access, command integration and receipts

8 October 2026. App baseline `8b9dd63aa99f72c2b120e43201579756611d9d3c`; PM `464c85402c14a63eb2971ec84ddbe3a785d74966`. Owner explicitly replaces per-feature narrow permissions with sufficient stable access for the planned whole OLTP/OLAP application, and asks to complete the originally planned command/receipt work in the same checkpoint. This supersedes 4E's wrapper-only direction for ordinary application data. It does not grant platform administration, PROD changes, real financial posting or notification activation.

A (Astra High) owns design/test plan/review. B (Astra Medium) implements. C `agent_c_testing_sol` (GPT-6.1 Sol Medium) executes the plan and reports gaps. D `agent_d_infrastructure_sol` owns infrastructure, live evidence/actions coordinated by root, tooling/docs/publication. R052 remains Open; no all-channel/phase-complete claim.

## Scope and package

Implement and test a stable DEV application capability policy, automatic future-object reconciliation, real non-superuser command API integration against disposable PostgreSQL, and the restricted manual-receipt adapter. D prepares the exact actual DEV authority and reversible synthetic receipt action plan; root integrates it before live mutation. No unreviewed live grants/migration, PROD, real payment changes or notifications.

D rechecked migration files: V78 is the head and V79 is reserved exclusively for this checkpoint's journal-function hardening. V78 bytes remain unchanged. Role/ACL provisioning is a separately managed environment prerequisite; no new business table/schema is required. Existing 4B preview, 4E postgres/V78 tests and deployed read/PWA routes remain intact.

## Stable capability policy

Create `mw_app_dev`, NOLOGIN, INHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS. A separate runtime LOGIN/IAM identity receives membership; it never owns application objects or belongs to migration/owner roles. Existing read identity is not silently broadened. D records any proposed live identity membership separately.

Eligible ordinary objects are in public and owned by registered migration creators. Initial live creator is postgres, verified by D; configuration supports additional explicitly registered creators without per-feature ACL edits. Unregistered ownership is an uncovered deployment prerequisite, not a silent privilege grant.

| Object | Stable application access |
| --- | --- |
| Ordinary application tables/partitions | SELECT, INSERT, UPDATE, DELETE |
| Application views/materialized views | SELECT; no automatic refresh/ownership privilege |
| Application sequences | USAGE, SELECT; no administrative setval privilege |
| Application SECURITY INVOKER routines | EXECUTE, except protected/admin exclusions |
| public schema / DEV database | USAGE / CONNECT; no permanent schema CREATE, database CREATE or grant option |

No table ownership, TRUNCATE, TRIGGER, REFERENCES, grant option or privilege escalation is needed by the runtime. Existing database PUBLIC TEMP/CONNECT privileges are not negative permissions that can simply be revoked from one role; inspect and report effective rights. Temporary workspace, if inherited, is not a claim of permanent-DDL authority. Do not change shared PUBLIC permissions merely to make an assertion pass.

Protected policy carveouts:

- No grants on system, agent_audit or other non-application schemas, Flyway history, credentials/secrets, migration/operator/audit objects. Reserved public prefixes flyway_, agent_, audit_, secret_, credential_, migration_ are excluded. Future protected objects use a protected schema/name or explicit comment beginning `mw-access:governance` / `mw-access:secret`; this is governance classification, not ordinary feature ACL maintenance.
- `public.pwa_payment_commands`: SELECT only to application role, for actor-scoped retained-identity reads by the server; no direct INSERT/UPDATE/DELETE/TRUNCATE/ownership.
- `r005_cash_cutover_sources` and `r008_cash_account_cutover`: SELECT only, needed by governed source effects; no direct mutation.
- Do not grant agent receipt projection or operator reallocation routines (`attach_payment_receipt_evidence`, `reallocate_payment_interest`, `reallocate_payment_interest_audited`), or migration-only initialization routines. Audit effective PUBLIC/inherited access and actual session/data guards instead of falsely claiming an explicit REVOKE on one role overrides PUBLIC. Existing exceptional routine rights must be labelled and tested; do not silently revoke other consumers.
- New SECURITY DEFINER routines are not automatically executable. Explicit approved exceptions are the two hardened PWA journal routines and existing boolean-only `payment_reallocation_permitted`. Unknown exposed definer/admin routines are a readiness finding. Future protected definer creation must revoke PUBLIC in its creating migration before commit.

### Future objects without feature-by-feature grants

Use a maintained plan/apply policy reconciler after DEV migrations to classify catalogue objects and grant the same capability set. Normal new application tables, sequences, views and invoker routines receive access automatically, without editing a table/column grant list or asking for permission per feature. Register actual object creators; test every registered creator.

Do not install blanket shared-public default DML ACLs: they could expose newly created governance objects before classification. Inspect `pg_default_acl` for each registered creator and report incompatible existing defaults. The supported future-object mechanism is the post-migration reconciler, not a false claim that one creator's default ACL covers all owners. Governance/secret objects remain excluded before and after reconciliation. An unrelated/new schema, privileged definer or new creator is an intentional capability boundary rather than a promise to permit unknown future administration.

The DEV migrate hook reconciles only when the capability package has been explicitly provisioned; it does not create roles during an unrelated info/validate call or run in PROD. Hook failure leaves the migration result visible but marks application-access readiness incomplete. Plan defaults to read-only; apply verifies the exact target and captures private before-ACL/membership recovery evidence. Restore only introduced grants/memberships, preserving unrelated changes. No live action occurs merely because a source hook exists.

## Immutable journal exception and V79

Ordinary business access is broad. Journal insertion remains one protected exception because arbitrary insertion could fabricate an original financial outcome.

Provision NOLOGIN `mw_app_dev_journal_owner`, with membership in mw_app_dev and SELECT/INSERT only on the journal, no membership granted back to runtime. V79 recreates the existing submit/status bodies with only the entry guard/security ownership changes required, then makes them SECURITY DEFINER owned by this dedicated role. Do not rename existing signatures, change allocation/rejection logic or edit V78. Keep the table/immutability guard owner and append-only triggers unchanged.

Entry guard requires current_database in the exact DEV or guarded disposable database set (`loan_manager_dev`, `payment_rehearsal`) and session_user membership in mw_app_dev. Fixed search_path and qualified objects remain; PUBLIC EXECUTE stays revoked. The application capability receives EXECUTE on submit/status. Definer owner inherits ordinary business rights and only the extra journal insertion capability. Runtime cannot SET ROLE into it, alter routines, disable triggers or write journal rows directly. These controls do not authenticate Firebase; the API still owns verified-user authorization.

Migration-role creation/grants are prerequisites established by the environment/fixture provisioner before V79. Any temporary owner-transfer prerequisite must be removed before commit/readiness. D wires maintained fresh database CI prerequisites without changing an existing live identity. Exact tested privileges and effective ownership are the acceptance gate; do not assume postgres-superuser tests establish it.

## Command API role integration

Preserve the original4E disposable postgres/V78 factory and tests. Add a separate application-role factory. The runtime must not read Flyway history, arbitrary server settings or PostgreSQL data_directory just to identify its target.

The disposable harness uses an admin pool to verify the random owned real data directory, loopback database, exact complete V79 history and server port, then issues an opaque process-local attestation (private brand/WeakSet; plain objects are rejected). Each runtime connection separately checks expected database/address/port, exact session_user=current_user LOGIN, non-elevated flags, capability membership and absence of journal-owner/migration memberships. Connect as that LOGIN with a fresh actual connection; SET ROLE under postgres is not evidence.

Retain4E HTTP/auth/actor/body/receipt/retry/unknown semantics and safe pool quarantine. The broad role now covers Partners and actor-scoped retained-journal SELECT directly; no proliferation of per-feature read wrappers. The tested journal routine supplies protected writes. No financial GET or automatic retry/new request UUID. Live config must eventually pin the actual DEV Cloud SQL tuple and dedicated IAM identity; the local attestation is not a production authorization token or replacement for deployment verification.

PROD isolation includes application target rejection and absence of PROD application grants. A PostgreSQL role is cluster-wide, and PUBLIC CONNECT may already allow connection to another database; do not promise connection denial without verifying that ACL. Tests use an isolated stand-in, never live PROD. Where CONNECT remains inherited, prove business access denied and API config rejects the PROD tuple. Changing PROD PUBLIC CONNECT would require separate coordination and is not this checkpoint's default action.

## Manual receipt adapter and real compatibility proof

D verified the current DEV AppSheet Payments[Uploaded Receipt] Image folder expression `manual-receipts/dev` at app version1.000207 and the historical synthetic mapping under `appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/` in the existing private bucket `mw-payment-receipts-prod-508610-n7`.

Restrict generated references to:

- SQL/AppSheet: `manual-receipts/dev/pwa/<requestUUID-lowerhex-no-hyphens>/<receiptUUID-lowerhex-no-hyphens>.png` or `.jpg`.
- GCS: `appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/pwa/` plus the same generated suffix.

Use only canonical server-generated UUID hex components and fixed extensions; never normalize arbitrary filenames, legacy references or Unicode paths, and never substitute the agent-only `//` convention. Exact environment/bucket/folder/prefix config is required. This new generated path remains a candidate until the actual roundtrip is observed.

Adapter creation uses generation-match0, immutable bytes/hash/MIME/size, trusted principal/request/actor binding metadata and exact-key reads. Preserve bounded PNG/JPEG decoded validation and technical5MiB/20MP limits; unsupported HEIC handling remains explicit. No overwrite/list/delete or silent image removal. Resolve only owned matching receipts; known journal replay uses the original retained descriptor without requiring current image availability. Metadata replacement/removal remains separate from money and protected agent fields remain unchanged. No new bucket or production prefix access.

C's synthetic storage transport tests establish logic, not AppSheet rendering. D's proposed actual proof uses the existing synthetic R046-payment/R046-borrower only after root integrates its exact action/recovery plan: private snapshot of manual reference/time, upload a distinct synthetic generated object, temporarily change only the manual metadata reference, visually read the current DEV AppSheet image, then compare-and-set restore exact original reference/time as the tested V52 constraints allow. D must settle restore behaviour with the existing timestamp trigger before mutation; do not promise a timestamp restore by an ordinary reference update. No real borrower/payment, financial fields, agent receipt fields or notifications are touched. Object cleanup/retention ownership and exact identity/grant scope are explicit in D's plan. Stop only that live path if safe restoration or isolation is unresolved; independent code/role tests continue.

## Executable test plan for C

### Preconditions and commands

C reads this plan and final B handoff, verifies unchangedV78 and scopedV79 diff, and uses only maintained tools/synthetic data. D owns the exact live receipt action; C has no live mutation task. Create a fresh complete V1–V79 loopback cluster with the existing ownership/path guards. Provision a true non-superuser LOGIN test role, mw_app_dev and journal owner prerequisites; preserve4E fixtures separately. Include a second synthetic registered creator to prove owner coverage, not a live migration-role claim.

Planned command from `C:/GitHub/MW-Credit-App`:

```powershell
. ./scripts/Enter-Dev.ps1
./tests/integration/Run-DevAppCapability.ps1
```

Runner executes B `dev-app-capability.test.mjs`, C `dev-app-capability-independent.test.mjs` and focused receipt-adapter tests against its owned target. If B chooses equivalent paths, record the final exact commands before running. D executes maintained `scripts/database/Test-CI.ps1` once after focused freeze because migration/runner changes require it. Do not rerun unrelated browser suites or live readiness probes.

### Cases, steps and pass criteria

| Case | Executable action | Required result |
| --- | --- | --- |
| Actual runtime identity | Fresh LOGIN connection; query session/current role and flags/memberships; attempt SET ROLE owner/migrator | Exact non-superuser identity; no admin/bypass/migration/journal-owner capability; escalation denied |
| Application breadth | Under runtime, SELECT representative operational/OLAP views; perform reversible synthetic borrower/loan/charge/payment/master-data changes using governed fixtures; sequence/invoker calls | Planned business access succeeds under ordinary role; triggers/calculations still govern; no postgres execution shortcut |
| Future objects/creators | AS each registered creator create synthetic ordinary table+sequence+view+invoker routine; reconcile automatically; use fresh runtime connection | Same access without grant-policy edit; creator not registered is reported uncovered; no misleading default-ACL ownership claim |
| Protected future/current objects | Create governance-tagged/name-reserved object and revoked-PUBLIC definer fixture; reconcile; attempt direct journal/Flyway/audit/cutover writes, TRUNCATE and permanent DDL | No unintended capability; journal direct INSERT/UPDATE/DELETE/TRUNCATE denied; protected helpers/administrative effects denied or explicitly reported inherited-right limitation; no alteration of constraints to pass |
| Journal definer | Execute normal API submit/status under true runtime role; exact replay, changed body/actor, source correction/delete, current mapping denial, commit-loss seam | One financial effect, retained original outcome, current authorization and4E error semantics; direct journal write still fails |
| Pool/error guard | Wrong DB/port/user/role/forged attestation; timeout and failed rollback/commit seam | No financial execution on invalid target; uncertainty preserved; broken/uncertain client discarded |
| PROD stand-in | Create separate disposable database with known ACLs; connect/attempt synthetic table access; feed its tuple to API factory | API rejects wrong target; no business grants. If PUBLIC CONNECT permits connection, report it truthfully rather than assert denied connection |
| Reconcile recovery/idempotency | Plan then apply policy twice; capture ACL before/after; introduce unrelated allowed fixture grant | Second apply has no unintended delta; rollback plan removes only introduced policy grants; no PROD role/object changes or ownership transfer |
| Receipt path and bytes | Valid generated UUID suffixes; invalid/traversal/foreign environment/config/name cases; fake create-only transport and exact reads | Exact SQL/GCS pair; no arbitrary path transformation; generation0 prevents overwrite; no list/delete; mismatch/invalid bytes/oversize/unsupported type fail before attachment |
| Receipt authorization/replay | Same/different request/actor/receipt; unavailable bytes; retained original receipt after posting/replacement | Only exact binding resolves; errors never silently drop image or repost money; known replay survives current descriptor loss |
| Actual compatibility evidence | Review D's authorized synthetic upload/reference/render/restore result and identities | Only call real compatibility verified if current DEV AppSheet actually renders the new generated reference and restore readback succeeds; otherwise label that path pending |

Use transaction rollback or owned disposable teardown for ordinary fixtures. Concurrency tests need real separate runtime sessions. Reuse the already passed V78 engine suite only while its bytes/business logic remain unchanged; rerun affected journal/API cases because execution identity changed. C reports concrete permission/trigger failures to A/B, not ad-hoc broad grants to make tests green.

### Evidence and retesting

Publish sanitized command/version/hash, role flags/membership/ACL summaries, future-object and protected-object results, API transaction counts, receipt transport assertions and actual-versus-synthetic compatibility distinction. No secrets, real file bytes, borrower identities, IAM tokens or unrestricted ACL dumps in repository evidence. D holds private recovery snapshots and live identity detail.

After a fix, rerun affected cases and then the frozen focused runner; D runs required CI once. A reviews scope/security semantics and unresolved limits. Stop at the tested integrated capability/API/receipt checkpoint plus the concrete DEV action/verification record, not at a permissions-only document. Root reports actual completed versus pending live work and retains the next owner review checkpoint. No notification/PROD activation or full financial parity claim.

### Root-coordinated synthetic receipt restoration decision

D reported the V52 timestamp limitation before mutation. Root approved the bounded known-synthetic R046-payment test using normal restoration of the original manual reference while retaining the truthful advanced upload timestamp as an intentional test-only effect. No trigger disable or privileged timestamp bypass is authorized. D holds the private before snapshot and asserts unchanged financial/agent fields and dependent fingerprints. The earlier exact-original-timestamp restoration expectation is superseded only for this identified synthetic record; no real record is included.

### Storage adapter handoff

Injected create receives bucket/key/bytes/MIME/metadata/ifGenerationMatch:0 and returns a canonical positive decimal generation; read accepts exact bucket/key and optional known generation, returning bytes/MIME/metadata/generation. Metadata strings bind version1, environment dev, requestId, receiptId, SHA-256 of canonicalActor JSON, byte digest, MIME and byte length. Resolve validates actual bytes and every binding; an exact-key latest read can reconcile an unknown upload acknowledgement, then retain the returned generation. No list/overwrite/delete. Decoder validation is required through the maintained Pillow logic or an equivalent explicitly supplied validator; absence never means accept. The compatibility flag is backed by D's actual evidence, not evidence itself. Adapter plus command-resolver integration is in scope; no new live upload/retrieval HTTP route is implied by this handoff.
