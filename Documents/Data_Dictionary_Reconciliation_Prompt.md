# Execution prompt: reconcile OLTP, OLAP and PostgreSQL dictionaries

Give the next model access to this repository and ask it: **“Execute the prompt in `Documents/Data_Dictionary_Reconciliation_Prompt.md`.”** This file is an execution brief, not evidence that reconciliation has happened. Read the whole brief once, then work through one phase at a time.

---

## 1. Your task and authority

Perform a thorough, evidence-backed update of the maintained data dictionary for AppSheet OLTP, AppSheet OLAP and their PostgreSQL databases. Reconcile existing imported records with current saved live definitions, add missing definitions, document verified DEV differences, and validate completeness and accuracy. Deliver the updated files, reproducible checks, a coverage report and a clear handoff for any unresolved items. Do the work; do not stop after proposing a plan.

This prompt authorizes **read-only live inspection and local documentation/tooling changes**, followed by normal Git publication under the repository's standing rule. It explicitly authorizes the dictionary reconciliation previously deferred during the Excel migration. It does not authorize fixing live defects encountered during inspection.

Follow the current root `AGENTS.md` and any applicable narrower instructions. In particular:

- Do not edit/save/regenerate AppSheet definitions, change app mode, copy apps, deploy, upgrade, invoke actions, run bots, submit forms, force notifications, or alter schedules for this task.
- Do not execute SQL DDL/DML, migrations, backfills, application functions, fixtures, restoration, Flyway repair/clean/baseline, or permission/network changes. Even a `SELECT` can invoke a function with side effects: use reviewed metadata queries only.
- Do not access operational borrower/transaction rows to populate this dictionary. Metadata and configuration are sufficient. Do not test notification routing by sending messages or inspecting contact records.
- Do not edit `sources/`, the frozen Excel workbook, original migration evidence, or historical imports. Do not run historical workbook writers or rerun the migration over the maintained dictionary.
- Do not change another task's work, create release numbers, freeze releases, mark products Released, create RCs, or alter other models' settings. This documentation task needs no new product release number.
- Use one agent unless the owner separately requests delegation. Continue independent work if one source is inaccessible.

If a live defect is discovered, document the exact observed configuration, dependency and impact as a finding. A dictionary update must not silently become a live repair or an approval of the observed behavior.

## 2. Scope and definition of success

Inspect these six targets independently, confirming their current identities before access:

| Target | Required result |
| --- | --- |
| PROD OLTP | Complete canonical saved production definition coverage |
| PROD OLAP | Complete canonical saved production definition coverage |
| DEV OLTP | Complete comparison with PROD OLTP; verified differences documented |
| DEV OLAP | Complete comparison with PROD OLAP; verified differences documented |
| PostgreSQL PROD | Complete relevant schema/configuration metadata for `loan_manager_prod` |
| PostgreSQL DEV | Complete relevant schema/configuration metadata for `loan_manager_dev`, compared with PROD |

The database names above are expected targets, not sufficient proof of identity. Verify project/instance/host/port/database using the current inventory and actual connection. The two databases share an instance; host equality does not imply environment equality. For apps, verify UUID, internal name, environment, saved version and each source binding.

Include all user-defined objects within these two databases and all saved app configuration relevant to their data model, access, calculations, workflows and presentation. Discover the actual schema list before defining database coverage. Record system/extension-managed namespaces and exclusions with reasons; do not pretend they were fully audited. Include SQL reporting objects in these databases even if another tool consumes them.

Exclude a separate AI Collection runtime, `mw_agent`, Metabase's own application database, dashboard redesign, Grafana/Looker inventories and unrelated cloud administration. Record dependency boundaries without expanding into those systems. RCs, obsolete prototypes and removed apps are not current canonical targets.

Success means every discovered in-scope object and property is accounted for, exact saved values are reconciled, independent validation passes, and evidence is tied to stable source versions/captures. A parser pass, an old export, matching totals, or a few sampled tables is insufficient. If access or coverage prevents this, deliver useful verified work with **Partial — verification incomplete**, quantified gaps and precise next steps.

## 3. Start safely and read the necessary references

1. Work from `C:\GitHub\AppSheet-Loan-Project`. Record the starting Git commit, branch, upstream and working-tree status. Preserve relevant uncommitted work before edits; record ownership/exclusions. Never stash/reset/overwrite another task's work automatically.
2. Look for an existing continuation note for this reconciliation. Resume it rather than creating duplicate runs or repeating valid checks.
3. Read these small governing files: `Documents/Data Dictionary/README.md`, `FORMAT.md`, `catalog.yaml`, `unresolved.yaml`, `development/README.md`, and `scripts/dictionary/README.md`.
4. Read affected entries in `Documents/Environment_Inventory.md`, the current-development section and relevant rows of `Documents/Release_Tracker.md`, and relevant `Documents/Development_Changes.md` entries. Read linked release evidence only to resolve current differences or conflicts. Re-read mutable status records before changing them.
5. Read relevant business/ownership sections of `Documents/Solution_Design.md` and `Documents/AppSheet_Data_Model_Overview.md`. Read `scripts/README.md` for runtime/credential setup and the applicable database procedure before using database tools.
6. Use `rg`, filenames and bounded reads. Do not load the multi-megabyte `Documents/Data_Dictionary_ChatGPT.md`, every YAML object or every historical log into context at once. That generated Markdown export is not an authoritative input.
7. Locate current runtimes and installed dependencies using the maintained guides and available environment tools. Use the existing root dependency junction. Install a documented missing dependency only in its approved external location; do not reinstall working dependencies.
8. Run the existing dictionary validator once and record the baseline failures/limitations. This separates pre-existing structural issues from your changes.

Git is the rollback point for this file-only task. No live app/report/database mutation is authorized, so do not manufacture live backup/copy work. Credentials, authentication exports and private raw captures must remain outside `C:\GitHub`, under the approved `C:\Users\MWCredit\Documents\ChatGPT` project folder. Never print credential values, full connection strings or authentication files.

**Checkpoint A:** Save confirmed target identities, read-only access methods, baseline validation and starting Git state before collecting detailed definitions. If an identity cannot be confirmed, stop that target's access and continue other confirmed targets.

## 4. Create an evidence and progress record

Create one run folder under `outputs/dictionary-reconciliation-<YYYYMMDD>/` using the actual date. If it exists, resume the matching run or use a descriptive suffix without overwriting another run. Create/update one change log named `Change Logs/CHANGE_NOTES_DATA_DICTIONARY_RECONCILIATION_<YYYY-MM-DD>.md`.

Keep these records in the run folder:

| File | Minimum contents |
| --- | --- |
| `README.md` | Scope, source identities, capture window, results, limitations and evidence links |
| `coverage.json` | Every discovered object, property coverage, dictionary destination, evidence and status |
| `findings.md` | Conflicts, confirmed absences, live defects, inaccessible properties and unresolved decisions |
| `validation.json` | Commands/check definitions, source IDs/hashes, actual results, mismatches and exit codes |
| `continuation.md` | Last completed phase/batch, remaining items, blockers and exact next action |

Use `coverage.json` as the single work queue. Its entries must have at least:

```json
{
  "target": "production-oltp",
  "source_identity": "<verified UUID or full database identity>",
  "source_version_or_capture": "<saved app version or metadata capture ID>",
  "object_kind": "table",
  "object_name": "<exact live identity>",
  "dictionary_path": "<owning YAML path, or null if not yet mapped>",
  "status": "pending",
  "expected_properties": 0,
  "verified_properties": 0,
  "unknown_properties": [],
  "evidence": [],
  "last_checked_utc": null
}
```

The zeros above are placeholders, not measured counts. Populate them from actual inventory. Use statuses `pending`, `captured`, `updated`, `verified`, `blocked`, or `excluded`; exclusions require a reason. Track property-level omissions in a companion structure within the same file when necessary. These are work-queue statuses, **not** new YAML `verification.status` values.

Every evidence record needs a target identity, app version or database snapshot/capture, UTC timestamp, acquisition method, exact source location, and content hash for saved artifacts. Keep raw private captures externally; publish only reviewed metadata extracts without secrets or row data. Redact sensitive literals with an explicit unavailable/redacted marker and private evidence reference; never substitute a fabricated working value. Mark any resulting inability to verify an exact value as a limitation.

Update the queue and continuation after each completed batch. Keep user updates concise and timely. Never mark an object verified merely because it was written or structurally valid.

## 5. Discover and capture the sources

### 5.1 AppSheet — each of the four apps

1. Use available supported read APIs, current saved AppDoc/configuration exports and the current editor. Discover the actual supported tools; do not invent endpoints or assume a row-data API exposes the app definition. Inspect an existing collector before reuse for hardcoded targets, private output paths and write effects.
2. Confirm app identity and saved version at capture start. Capture a complete object list before editing dictionary files. Include disabled, hidden and generated objects. Follow all pagination, collapsed sections and nested configuration where applicable; save large results to files and inspect bounded portions.
3. Capture every exposed property for each discovered object. An export can omit bot settings, app-level settings or other categories. Map which source covers which category; use targeted editor inspection to fill gaps. Export omission is not proof of object/property absence.
4. Compare the captured inventory with the current editor's inventories/counts. For each object kind present, verify a representative full object against an independent editor read; verify every ambiguous, omitted, conflicting or truncated property directly. Sampling checks the collector, not the whole dictionary: exact source-to-dictionary comparison must cover all captured objects/properties.
5. Read-only inspection of current editor diagnostics may be recorded as findings. Do not save/regenerate to remove warnings or run Deployment Check. This is not a DEV-readiness or production-closure task; an existing live warning is not permission to repair the app.
6. Recheck the saved version after capture and before closure. If it changed, determine affected definitions, recapture them and rerun dependent checks. Do not combine mismatched versions and call the result current.

Required coverage, using exact live names rather than guessed property spellings:

| Area | Capture and reconcile |
| --- | --- |
| Tables and bindings | Source type/ID, database/schema/relation mapping, partitions if present, keys/labels, update permissions, security filters and table settings |
| Columns | Physical/virtual/generated identity; type and qualifiers; key/label flags; Ref target/key and ownership; initial value, App formula, spreadsheet formula if applicable; Valid_If, Suggested_Values, Required_If, Editable_If, Show_If, reset behavior; display/localization, precision, enum/list settings; every other exposed property |
| Slices | Source table, row filter, update mode, full ordered column membership and action membership/settings |
| Actions | Source/target tables, type, condition, expressions/assignments, ordered grouped actions, referenced actions/rows, navigation, visibility/prominence and confirmation settings |
| Views and formats | Data/slice source, type, position, ordered fields, grouping/sorting, filters, nested dashboard views, event actions, format-rule conditions/targets and display expressions |
| Automation | All bots, events, processes, steps and tasks; stable identities and references; enabled states, event conditions, schedule/time zone, execution order/branches, tasks/templates, write mappings and retry-relevant settings |
| Routing and protection | Exact recipient expressions and actor mapping logic, environment links, webhook/export destination configuration, scheduled canonical-app guards and their placement before side effects; redact secrets |
| App settings | Sign-in/access configuration, roles/filters where exposed, user settings, locale/time zone, sync/offline/data behavior and remaining saved configuration, including presentation groups |

Document template references and model expressions used by templates. Do not ingest rendered borrower documents or deliver messages. Where linked template logic cannot be inspected within authorized access, record the dependency and gap.

### 5.2 PostgreSQL — each database independently

1. Review `scripts/database/Get-DocumentationInventory.ps1`, `Export-Schema.ps1` and the connection resolver they use before execution. Resolve current targets through maintained configuration; never copy credentials into a script or prompt.
2. Use metadata-only reads in an explicit read-only transaction, preferably a repeatable-read snapshot with suitable timeouts. Record `current_database()`, server identity/version and relevant session settings alongside the independently confirmed cloud instance. Use one consistent capture per database; do not hold a transaction open while manually editing files.
3. The existing documentation inventory is a starting point, **not complete coverage**: it has namespace restrictions, stores function hashes instead of full bodies, and omits several object/configuration classes. The existing schema export omits ownership/grants and has fixed schema filters. Discover missing coverage and supplement it with reviewed catalog queries.
4. If a new reusable collector/comparator is necessary, keep it under `scripts/dictionary/` or `scripts/database/`, default it to read-only, document usage and verify it on synthetic local fixtures. Do not install database objects to assist extraction.
5. Inventory all relevant schemas and object kinds before filtering. Capture zero counts explicitly when a kind is absent. Distinguish user-managed, internal and extension-owned objects so objects are neither missed nor counted twice.
6. Reconcile Flyway metadata with repository migrations and recorded release evidence. Record applied versions/checksums/status and pending/drift findings. Do not assume the highest numbered repository migration is applied; do not fix drift or compute Flyway checksums with an invented algorithm.
7. Before closure, recheck migration history and relevant schema-definition fingerprints. If changed, recapture the affected scope and invalidate dependent comparisons. Separate hashes from different serialization formats are not directly comparable.

Capture full definitions and relevant attributes, not just names/counts/hashes:

- Schemas, ordinary/partitioned tables, partition relationships, views/materialized views and their definitions, column order/types/domain/array details, nullability, defaults, identity/generated expressions and comments.
- Primary/unique/foreign/check/exclusion constraints, participating and referenced columns in order, referential actions, deferrability and validation state; indexes including expression/predicate, uniqueness, included columns, access method and validity.
- Functions/procedures identified by **schema + name + argument signature**, full bodies, result type, language, volatility, strictness, security mode, configured search path/settings and relevant privileges. Do not collapse overloaded routines by name.
- Triggers identified by table plus trigger name, full definition, enabled mode, event/timing, WHEN condition and called routine. Include internal integrity behavior through its owning constraints; distinguish it from user triggers.
- Sequences and ownership, custom types/domains/enums, extensions, row-level-security enable/force state and policies, ownership/ACL/default privileges and role dependencies relevant to these databases, without credential/role-password dumps.
- Relevant scheduled database jobs, enablement, time zones and called logic; capture commands privately if they contain sensitive literals. Identify AppSheet versus database scheduler ownership without enabling, disabling or invoking either.
- Flyway history as deployment metadata, never as an AppSheet business table. Document dependencies on settings such as time zone/search path where observed; do not audit or change unrelated instance infrastructure.

**Checkpoint B:** The six source inventories and coverage gaps are recorded. Reconcile in small batches even if an independent target is blocked. No target may inherit another target's verification.

## 6. Reconcile into the maintained dictionary

Work in batches of roughly one table with its dependencies, or one small group of related configuration objects. Do not mechanically regenerate the whole tree.

For every batch, follow this sequence:

1. **Locate:** use `find` and targeted `read` to locate the owning YAML and relevant supplement records. Search exact identities too; helper name matches are only navigation hints and can miss dependencies.
2. **Compare:** compare each existing property with the fresh observation for the same target/version. Enumerate source-only objects/properties, dictionary-only objects/properties, changed values and ambiguous identities. Never choose a value merely because its file is newer.
3. **Decide:** current observed saved definitions establish what is live. Release/design records explain intent and ownership; historical imports explain provenance. If intent and live configuration disagree, document both and flag the defect. If two supposedly current observations disagree, resolve identity/version/source omissions first; otherwise leave that item unresolved.
4. **Write:** update the canonical PROD object with exact verified values, add genuinely missing objects, and record verified DEV differences separately. Retain historical provenance through evidence links. Preserve unrelated fields, stable filenames and exact labels.
5. **Read back:** reopen the saved YAML through the strict parser and compare the persisted typed values and ordered lists against the captured observations, not against the patch payload or a second copy of your intended output.
6. **Validate:** run relevant structural and semantic checks, update evidence/coverage, then proceed to the next batch.

Representation rules:

- Follow `FORMAT.md`. Use one file per substantial object and the existing common envelope. Reuse registered kinds. Group related settings where appropriate; do not create one file per property or one giant combined inventory.
- Preserve exact case, Unicode, expressions, quoting, embedded JSON strings and ordered lists. No summarizing formulas, placeholders in place of available values, “same as OLTP,” or abbreviated SQL bodies. Put explanatory interpretation beside exact definitions and label it as interpretation.
- Keep `null`, empty string, false, zero and absent distinct. An empty imported Excel cell does not prove a live default. Use the documented explicit state convention for genuinely unknown/inherited/removed values and record the evidence for effective inherited values.
- Do not convert embedded JSON strings into objects or change established content layouts merely for convenience. If a needed representation cannot fit the existing contract, make a small explicit format/tooling extension with documentation and focused tests; do not bypass validation.
- Use `(system, component, kind, name, scope)` identity and explicit live binding evidence. Canonical database definitions must unambiguously identify database and schema, not merely their shared instance. Reconcile old labels such as `DEV ...` or `development-and-production` individually using evidence; do not infer identity from labels.
- Keep production definitions and DEV differences separate. Follow `development/<system>/<release>/<object>.yaml` for known product deltas and `development/<system>/environment/<object>.yaml` for verified intentional environment differences. Reference the production identity and explicit before/after/absent states; do not duplicate entire unchanged PROD objects as overlays.
- Record exact DEV state even if its release owner is unknown, but mark ownership unresolved rather than assigning it to the current Open release by guess. Do not infer an active DEV overlay from imported Dev Differences. Model DEV-only/removed objects explicitly and avoid inventing PROD counterparts.
- `verification.status` currently permits only `imported-unreconciled` and `documented`. Change an imported object to `documented` only when its claimed current contents have evidence and unresolved properties are explicitly represented. A partial property update must not imply whole-object reconciliation. The summary and coverage queue must still show all remaining gaps.
- The guarded update helper cannot change identity or mark an imported object reconciled. For such changes, use an intentional direct edit or reviewed local writer with a just-read file-hash guard, typed roundtrip, source evidence, index rebuild and full validation. Do not weaken the helper's safeguards.
- Remove/retire a canonical object only after a complete current inventory proves absence in the correct scope. Keep a removal decision/evidence and historical trace; missing permissions, filters, parser failures or export omission do not prove removal. Confirm all incoming dictionary references before retiring it.
- Preserve historical imports and migration artifacts. Resolve their implications through canonical objects, evidence links and the unresolved register, not by rewriting the past. Split partially resolved register topics by system/scope rather than marking a broad mixed-system issue resolved.
- Do not relabel Metabase/Grafana or an entire registry system as verified because this narrower batch passed. Registry status is not a blanket live-verification claim.

Example decision: if PROD has formula A and DEV has formula B, document A in PROD and B as a verified DEV difference. If an old supplement says C, keep it as dated evidence and explain the conflict. If an export omits the formula, inspect another live source or mark it unknown; do not choose A, B or C by recency alone.

## 7. Validate independently and exhaustively

Perform all applicable checks below. Validation code must read saved files and captured source observations independently. Do not manufacture observations from expected values, use a file's own hash as proof it matches live state, or treat matching counts as proof matching identities/content.

### 7.1 Completeness and exact-value comparison

- Compare **sets of exact object identities in both directions** for every target and kind. Reconcile every extra/missing entry. Include disabled/hidden/generated objects and schema objects unused by either app.
- Compare property path sets and values, including exact multiline expressions, embedded strings, state distinctions and ordered membership. Show expected/captured/represented/verified/unknown totals, missing identities and mismatch paths. Verify each captured property has a destination or an explicit reason for exclusion.
- Reconstruct each observed DEV object's effective definition from its verified PROD baseline plus explicit deltas in the comparison logic. The existing helper does not do this automatically. Compare with the independently captured DEV definition, including removals and DEV-only objects; unexplained differences fail.
- For SQL, compare full routine/view/trigger/constraint/index definitions and metadata using documented serialization. Strip only demonstrated transport noise. Do not normalize away case-sensitive identifiers, literal strings, operators or expression differences.
- Check that collectors did not truncate, skip pages, omit categories or flatten distinct objects. Review source parse errors and empty results. A query failure is not an empty inventory.

### 7.2 Cross-object and cross-system integrity

- Every app source binding resolves to the correct environment and database relation, or to an explicitly documented non-PostgreSQL source. Every physical app column maps to its actual source; virtual/system fields are identified so they are not falsely required as SQL columns.
- Each Ref resolves to the exact app table/key, with SQL foreign-key relationships separately documented. Absence of a physical FK is a finding about enforcement, not proof that the logical Ref is invalid.
- Slice members exist, order is preserved, and source permissions/security filters are accurately documented. Views, actions, formatting and automation references resolve to captured definitions or explicit external dependencies.
- Compare shared SQL tables against **both** app consumers. Check ownership of edits, materialized/virtual calculations, default versus initial-value behavior, precision/nullability and intentionally different app presentation/validation. Do not force OLTP/OLAP equality where responsibilities differ.
- Trace saved dependencies for key financial/analytical workflows from app entry point/action through writes, SQL triggers/routines and reporting sources. Include configured payment allocation, charges, loan closure/default, balances, assessments, snapshots and settlements where present. Use actual discovered object names. Validate documentation lineage, not runtime outcomes.
- Trace notification expressions and scheduled execution guards from configuration, including DEV/PROD link destinations and environment differences. Do not claim actual recipient delivery, retry safety or scheduler execution from static inspection.
- Treat text search as a dependency aid, not a complete AppSheet/SQL parser. Review ambiguous expression references and dynamic SQL manually; retain uncertainty where static inspection cannot resolve them.

### 7.3 Local structure, evidence and source stability

Use the executable located from the runtime guide; the commands below are templates for actual local execution:

```powershell
$dictionaryPython = "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"
& $dictionaryPython scripts/dictionary/dictionary.py find Loans
& $dictionaryPython scripts/dictionary/dictionary.py read systems/appsheet/oltp/tables/loans.yaml --pointer '/content/columns'
# Preview a real patch before applying it; never execute a placeholder path.
& $dictionaryPython scripts/dictionary/dictionary.py update '<actual-patch.json>'
& $dictionaryPython scripts/dictionary/dictionary.py update '<actual-patch.json>' --apply
& $dictionaryPython scripts/dictionary/dictionary.py index
& $dictionaryPython scripts/dictionary/dictionary.py validate
git diff --check
```

Check each exit code before continuing dependent work. Read back each changed object. Check duplicate identities/keys, registered kinds, format contracts, evidence pointers, index consistency and frozen workbook hash. Check changed Markdown links and intended file scope.

If changing helper/collector/comparator behavior, run its focused tests and the existing applicable dictionary tests. Use synthetic fixtures that demonstrate detection of a missing object/property, altered formula, reordered list, null/blank/absent difference, overloaded SQL routines, stale capture and wrong environment. Do not create tautological tests or launch unrelated application regression suites for documentation edits.

Recheck all four app versions and both database metadata fingerprints/history before finalizing. If sources moved, revalidate affected scope. Report per-target capture times if there is no simultaneous ecosystem snapshot; do not claim cross-system atomicity. If changes keep occurring, retain a verified dated checkpoint and identify what requires recapture.

**Checkpoint C:** Structural checks, exact-value comparison, complete set accounting, semantic dependency checks and source-stability checks all have real recorded outcomes. Unknowns and warnings remain visible. Dictionary validation is not a claim of working live financial behavior or product-release readiness.

## 8. Documentation closure, publication and final response

1. Update dictionary navigation/coverage guidance and `unresolved.yaml` to reflect actual scope completed and remaining gaps. Remove stale blanket claims only for the reconciled scope; preserve other systems' limitations.
2. Update `AppSheet_Data_Model_Overview.md` only if the explanation of observed architecture/ownership/behavior needs correction. Update `Environment_Inventory.md` or `Development_Changes.md` only where verified facts changed. Explain differences between deployed reality and intended design instead of silently treating one as the other.
3. Update the reconciliation change log with scope/date/purpose, exact changed files/categories, baseline/rollback, source evidence, verification results and unresolved/manual work. Link affected release logs when necessary to correct their current-status implications; preserve dated history and never claim deployment occurred during this task.
4. Regenerate `index.json` with the maintained helper and rerun final validation. Do not require the original migration equality check to pass after intentional reconciliation; it proves a historical conversion, not current live truth. The frozen workbook must remain byte-identical.
5. Inspect current Git status and the exact intended/staged diff. Exclude private captures, secrets, business rows, credentials, caches and dependencies. Stage named intended files, commit and push normally to the configured upstream under standing authorization. Do not force-add ignored files or overwrite others' work. Verify the pushed commit; if publication fails, preserve local work and report it.
6. Leave `continuation.md` with either explicit completion or an actionable unfinished queue. For every blocker state the target, exact failed method, smallest missing access/information, work already completed and next safe action. Do not stop all work because one category is blocked.

Your final answer must contain:

- **Outcome:** Complete, or Partial — verification incomplete, with the reason.
- **Coverage:** a compact table by target and object kind with discovered, verified, excluded and blocked totals; link the full property coverage report.
- **Changes and findings:** material reconciliations, live defects left unchanged, unresolved conflicts and DEV differences, with evidence links.
- **Validation:** which checks actually passed/failed, source versions/capture window and any limits on semantic or live-behavior verification.
- **Recovery/publication:** starting rollback commit, final commit/upstream verification, change log and continuation links.

Do not say “all verified” while entries are pending/blocked, redacted critical values are unverifiable, source versions changed without reconciliation, or coverage is based on samples. Separate documentation completeness from observed live defects and from runtime tests that this task does not authorize.
