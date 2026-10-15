# OLTP, OLAP and PostgreSQL dictionary reconciliation

**Outcome: Complete for discovered saved metadata, with explicit privacy and scope exclusions.** All six targets were captured independently and reconciled into canonical PROD records plus exact DEV overlays. This is documentation completion, not approval of live settings or a runtime/financial test result. Interpretation findings remain labeled.

Executed the [owner-invoked plan](../../Documents/Data_Dictionary_Reconciliation_Prompt.md) on 24 September 2026. AppDoc collection began at 10:45 UTC; final saved app checks ended at 12:56 UTC. PostgreSQL metadata was captured at 11:00 UTC and checked again through 12:35 UTC. Editor details were collected between 10:54 and 12:44 UTC. These are dated independent captures, not an atomic six-system snapshot.

## Target coverage

| Target | Saved version / database | Discovered owning identities | Verified captured identities | Whole objects excluded / blocked |
| --- | --- | ---: | ---: | --- |
| PROD OLTP | `3.000246` | 305 | 305 | 0 / 0 |
| DEV OLTP | `1.000075` | 305 | 305 | 0 / 0 |
| PROD OLAP | `1.100195` | 257 | 257 | 0 / 0 |
| DEV OLAP | `1.000031` | 257 | 257 | 0 / 0 |
| PostgreSQL PROD | `loan_manager_prod`, V39 | 156 | 156 | 0 / 0 |
| PostgreSQL DEV | `loan_manager_dev`, V39 | 144 | 144 | 0 / 0 |

Verified means captured non-redacted metadata. Counts union AppDoc/catalog, editor and template identities; overlapping facets are not double-counted. Nested columns, constraints and triggers remain inside their owners. System internals are outside the user-object denominator, not silently counted as zero.

| Kind | Each OLTP environment | Each OLAP environment | PostgreSQL PROD | PostgreSQL DEV |
| --- | ---: | ---: | ---: | ---: |
| Tables / relations | 34 | 23 | 58 | 56 |
| Nested columns | 790 | 668 | 845 | 826 |
| Slices | 8 | 12 | — | — |
| Views | 61 | 66 | In relations | In relations |
| Actions | 104 | 88 | — | — |
| Format rules | 60 | 48 | — | — |
| Bots + named reusable tasks | 10 + 12 | 2 + 1 | — | — |
| Settings groups | 16 | 16 | 1 | 1 |
| Referenced template | 0 | 1 | — | — |
| Routines | — | — | 90 | 83 |
| Schemas / sequences | — | — | 4 / 3 | 3 / 1 |
| Nested constraints / indexes / triggers | — | — | 228 / 60 / 274 | 216 / 57 / 273 |

OLTP has 18 physical business bindings and OLAP 19 per environment. Other AppDoc tables are generated process schemas and user settings. Reusable event/process inventories contain 10/10 for OLTP and 2/2 for OLAP per environment, embedded in their owning bot evidence.

App UUIDs and versions are in [coverage](coverage.json). Cloud project `clever-oasis-508610-n7`, instance `appsheet-pg-prod-20260914`, connection `clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914`, host `34.21.174.215:5432`, PostgreSQL `18.6`. Source alias `database-2` maps to PROD and `database-3` to DEV; both require SSL. A blank account-editor username control does not establish the effective connection role. See [source connections](source-connections.json) and [cloud identity](cloud-instance-identity.json).

## Changes

Updated canonical AppSheet tables/slices and added captured actions, views, formats, automation, settings and access/source metadata. Added full SQL routine bodies/signatures, relations, columns/defaults/constraints/indexes/triggers, view dependencies, schemas/sequences, relevant privileges/roles, jobs and Flyway metadata. The linked export template's exact cells are documented.

PROD values and DEV differences retain blank/absent distinctions, ordering, expression text and CR line endings. Historical R016 routine declarations and imported DEV aliases now point to current records without changing retained content. Frozen Excel, original migration evidence and historical supplements remain unchanged. Metabase/Grafana and the separate AI Collection runtime are outside scope.

Updated navigation, system guides, environment/V39 notes and unresolved topics. Architecture/business ownership did not change; no artificial model-overview rewrite or release allocation was made. Start at [Data Dictionary](../../Documents/Data%20Dictionary/README.md), with [AppSheet](../../Documents/Data%20Dictionary/systems/appsheet/README.md) and [PostgreSQL](../../Documents/Data%20Dictionary/systems/postgresql/README.md) guides. Material differences and lineage are in [findings](findings.md).

## Verification

1. Complete AppDoc DOM extraction matched an independent HTML parser and source inventory totals. Initial/final ordered AppDoc records matched exactly for all four apps.
2. Independent YAML readback compared every captured AppDoc/catalog object and typed property, reconstructing DEV through guarded deltas. Editor fields/snapshots were checked separately. See [exact values](exact-value-validation.json) and [editor values](editor-validation.json).
3. Both directions of identity coverage were checked. [Coverage](coverage.json) contains destinations, versions, expected/verified properties and excluded leaf pointers: 1,312 AppDoc/catalog facets, 438 editor facets and two template-use facets.
4. [Dependency checks](dependency-validation.json) resolve physical sources/columns, Refs, slices, views/dashboard members, action assignments/grouped references, format targets, 679 SQL view dependency edges per database and all 98 PROD/97 DEV user-trigger routine links. [Semantic review](semantic-review.json) checks selected workflow symbol links and environment parity.
5. Seven workbook sheets and 214 nonempty template cells were [captured](export-template-observations.json); all 119 checked literal references resolve in each OLAP app. [Template checks](template-validation.json) do not imply a rendered export.
6. Original SQL sections remained unchanged at final capture; added role/replication sections are explicitly separated from schema drift. Both maintained Flyway validations passed 40 checks (baseline plus 39 versioned migrations), with no invalid migrations or warnings. [Stability](source-stability.json) and [final editor checks](final-editor-status.json) record actual results. All four final editors showed no issues and Save disabled.
7. Final structural/index/frozen-workbook checks, tooling tests, privacy screening and evidence hashes are in [validation](validation.json). Structural validity alone is not live completeness.

## Limits and exclusions

The additional personal app-user identity in each PROD app and signed logo transport signatures remain private. Public values use explicit markers; 12 affected property leaves are excluded from exact-property totals. Access roles/policies and resource identities remain documented. No passwords or authentication exports are published.

`pg_catalog`/`information_schema` implementation inventories are excluded. Extension metadata found in user namespaces is retained, but vendor implementation correctness is not audited. No custom types, foreign tables, aggregates, publications, subscriptions, event triggers or non-view rules were found in inspected user scope; their empty arrays record those checks.

The static checker is not a complete AppSheet/PLpgSQL parser. It does not prove dynamic SQL resolution, financial calculations, runtime permissions, idempotency, delivery or export behavior. No operational rows, application functions, live data/configuration changes, app saves, migrations, notifications or jobs were executed. Effective inherited PROD table locale and intended locale policy remain unknown; exact saved controls are verified.

Raw captures and the original guarded plan remain under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/dictionary-reconciliation-20260924`. Public `plan.json` is a dated initial write manifest, predating editor/role supplements, and must not be replayed. Acquisition metadata and artifact hashes are in `validation.json`.

## Recovery and publication

Starting commit: `dffa437c29a762f5b87a10b14a32063da8df07aa`, initially clean `master`. Another task advanced HEAD to `9a623878d11a06b119e867e291340e60066bc894`; its work is preserved. Recover by reverting this task's commit or restoring selected paths, never resetting shared history to the starting commit. No live changes need rollback.

See [change log](../../Change%20Logs/CHANGE_NOTES_DATA_DICTIONARY_RECONCILIATION_2026-09-24.md) and [continuation](continuation.md). The final task response records the resulting commit and verified upstream publication.
