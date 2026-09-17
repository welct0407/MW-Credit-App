# Release record helpers

Local helpers for [the release workflow](../../Documents/Release_Workflow.md). They do not access live apps/databases, deploy, grant approval, discover unrecorded edits or certify release readiness. Use the bundled Node executable via the repository's shared dependency junction; no new installation is needed.

New releases use one `outputs/<release>/release-delta.json`. Existing active releases can retain equivalent records; do not migrate them just for this tool. Start from [example-delta.json](example-delta.json), replace every synthetic value and use the already reserved release number. The example does not reserve R000. An SQL-only release uses its Flyway manifest and log without an empty AppSheet delta.

```powershell
# Substitute the bundled Node executable when node is not on PATH.
node scripts/releases/delta.mjs validate outputs/<release>/release-delta.json
node scripts/releases/delta.mjs render outputs/<release>/release-delta.json outputs/<release>/checklist-r1.md
node scripts/releases/delta.mjs compare outputs/<release>/release-delta.json outputs/<release>/prod-readback-r1.json outputs/<release>/prod-comparison-r1.json
node --test scripts/releases/delta.test.mjs
```

`validate` checks record shape, unique IDs/paths, target states and substitution reasons. `render` generates a checklist and continuation section; edit the JSON, not generated Markdown. `compare` requires the matching candidate hash, revision, environment and app IDs, and compares every recorded item. Exit code 1 means an error, mismatch or missing observation. Output files must be new paths, so old frozen evidence is not overwritten. Generated Markdown is a readable view; JSON retains exact values and types, including newlines and ordered arrays.

## Delta fields

- `schemaVersion: 1`, `release: Rnnn`, positive `revision`; `apps` maps each affected app to its exact `dev` and `prod` IDs from the environment inventory.
- `items`: stable `id`, `app` (OLTP/OLAP), `object`, exact `property` path, `operation` (add/change/remove/rename/reorder), `dev` and `prod` target states. A rename also supplies `previousObject`; record old-object absence and updated references as separate items where needed. Nested values are allowed for a newly added object; otherwise prefer one changed property per item.
- A target is `{"state":"value","value":...}`, `{"state":"absent"}`, `{"state":"unset","effective":...}` or `{"state":"inherited","effective":...}`. JSON null, empty string, false and ordered lists are distinct. `absent` is intentional removal, never missing evidence. Different DEV/PROD targets require `environmentReason` describing a legitimate environment substitution; the tool cannot determine business legitimacy.
- Optional per-item `before`, `prodBefore`, evidence/test links and notes retain development/production history. Unknown historical values can be labeled unknown; final targets cannot. Keep rollback versions and exact observations in linked records. Reverted/superseded edits remain in the edit history with disposition, not as conflicting final targets.
- `continuation` has short `versions`, `done`, `next`, `decisions`, `evidence` strings. The log remains the owner-decision/approval source. Candidate hashing includes release/revision, app identities and deployment target/operation fields, not narrative or dictionary patches. Freeze the complete package with its Git commit and evidence links; this hash is only the AppSheet delta fingerprint.
- Keep source expressions literal and complete. Review artifacts before Git publication. Protected values require controlled external evidence and manual comparison; never insert secrets into this JSON or claim that matching redaction placeholders verifies private values. Such items stay explicitly pending/manual until the actual protected comparison is recorded.

The running edit record/payloads and review of affected generated/dependent settings establish completeness. The validator only verifies recorded entries; a green result cannot detect an omitted live change. No full app export is required.

## Saved readback format

Obtain observations independently from the saved/reloaded editor or targeted export. Never construct them by copying expected targets or edit payloads. Supply the hash printed by `validate` for the same frozen candidate:

```json
{
  "release": "R000", "revision": 1, "candidateHash": "<printed hash>",
  "environment": "prod",
  "items": [{
    "id": "APP-001", "appId": "<actual PROD app ID>", "version": "<saved version>",
    "observedAt": "2026-09-17T09:00:00Z", "evidence": "<readback artifact and location>",
    "observed": {"state": "value", "value": "<actual saved value>"}
  }]
}
```

Omitted items become Pending. Stale package/revision, duplicate/unknown IDs or missing observation metadata fail. A Verified result means the supplied observation matches the target; independently establish its authenticity, freshness and complete release coverage in the log. Exceptions and warning gates stay in the workflow; the comparator does not waive them.

## Reusing test evidence

Optional `node scripts/releases/delta.mjs fingerprint INPUT.json` prints file hashes and a context fingerprint. Input is `{"files":["<implementation file>","<test runner>"],"context":{"test":"<test ID>","environment":"<identity>","configuration":"<relevant config hash>","dataAssumptions":"<fixture/setup>"}}`. Paths are relative to the working directory. Save it with the original passing test evidence; recompute and compare when considering reuse. Select all relevant inputs and review live dependencies separately. Equal fingerprints never manufacture a passing test or validate live PROD.

## Targeted dictionary edits

`dictionary.mjs` updates existing rows only, using header names, unique row keys and exact old-value guards. It derives new values from delta items where possible. It writes a new workbook, leaving the source untouched. Row creation/deletion, formula edits and complex workbook features use the existing spreadsheet workflow; this helper does not rebuild inventories.

```powershell
node scripts/releases/dictionary.mjs plan DELTA.json INPUT.xlsx NEW-PLAN-DIRECTORY
# View the before PNG and inspect the plan. Then write a new candidate workbook:
node scripts/releases/dictionary.mjs apply DELTA.json INPUT.xlsx NEW-OUTPUT-DIRECTORY
```

Optional `dictionaryUpdates` in the delta:

```json
[{
  "sheet": "Column Rules", "range": "A1:E100", "previewRange": "A1:E4",
  "key": {"App": "OLTP", "Table": "Example", "Column": "Status", "Rule": "Show_If"},
  "column": "Expression", "expected": "TRUE",
  "fromItem": "APP-001", "environment": "dev"
}]
```

The range starts with the actual header row and bounds all rows to search; copy exact headers from the workbook, never assume example names. Prefer DEV differences rows for unpromoted changes; this helper does not decide which sheet represents production. `fromItem` needs a scalar `state:value` target; for explanatory text use `value` instead. Existing formulas cannot be overwritten. No source overwrite, auto-promotion or concurrent workbook merge occurs. It checks all sheets' values/formulas after export/import and writes before/after previews plus verification JSON. Review affected layout and native workbook features before replacing the shared dictionary in a coordinated task. Passing values/formulas checks is not a guarantee that every advanced Excel feature roundtrips.

Synthetic integration check: `node scripts/releases/dictionary.test.mjs create OUTPUT-DIRECTORY`, view the fixture PNG, then `node scripts/releases/dictionary.test.mjs verify OUTPUT-DIRECTORY`. No production dictionary is edited by this test.
