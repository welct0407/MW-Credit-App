# Release record helpers

## One checklist per release

The only promotion/documentation master is [templates/promotion-checklist.md](templates/promotion-checklist.md). Fill one release copy; never regenerate over recorded results or keep a parallel Excel/document checklist. Read only a triggered implementation section in [Release Workflow](../../Documents/Release_Workflow.md).

`node scripts/releases/checklist.mjs Rnnn outputs/<release>/promotion-checklist.md [affected Documents/path ...]`

Use the bundled Node runtime. The helper copies the master, fixes relative links, includes the three mandatory current-state records and adds explicitly affected documents. It does not reserve releases, enumerate the Documents tree, grant approval or execute checks. It refuses existing output files and archive paths. For an existing release continue its filled copy. If adopting a newer template, preserve evidence and mark only genuinely new required checks pending.

The manifest stores versions, Git/Flyway/RC pins and approvals; the log records concise scope/decisions. The filled checklist records completion and documentation closure. Templates for manifest/mapping/tests are supporting records, not separate activity checklists. Documentation-only work needs no product release number.

Optional exact deltas are technical evidence only. `delta.mjs validate`, `render` and `compare` validate recorded targets, render their detail and compare independent saved observations. Render no longer appends document rows; link its result from the single release checklist. It cannot detect unrecorded changes or certify release readiness. Existing historical deltas stay dated evidence.

Tests for helper changes: `node --test scripts/releases/delta.test.mjs scripts/releases/checklist.test.mjs`. No need to run these during an ordinary product promotion unless the helper changes.

## Delta fields

- `schemaVersion: 1`, `release: Rnnn`, positive `revision`; `apps` maps each affected app to its exact `dev` and `prod` IDs from the environment inventory.
- `items`: stable `id`, `app` (OLTP/OLAP), `object`, exact `property` path, `operation` (add/change/remove/rename/reorder), `dev` and `prod` target states. A rename also supplies `previousObject`; record old-object absence and updated references as separate items where needed. Nested values are allowed for a newly added object; otherwise prefer one changed property per item.
- A target is `{"state":"value","value":...}`, `{"state":"absent"}`, `{"state":"unset","effective":...}` or `{"state":"inherited","effective":...}`. JSON null, empty string, false and ordered lists are distinct. `absent` is intentional removal, never missing evidence. Different DEV/PROD targets require `environmentReason` describing a legitimate environment substitution; the tool cannot determine business legitimacy.
- Optional per-item `before`, `prodBefore`, evidence/test links and notes retain development/production history. Unknown historical values can be labeled unknown; final targets cannot. Keep rollback versions and exact observations in linked records. Reverted/superseded edits remain in the edit history with disposition, not as conflicting final targets.
- `continuation` has short `versions`, `done`, `next`, `decisions`, `evidence` strings. The log remains the owner-decision/approval source. Candidate hashing includes release/revision, app identities and deployment target/operation fields, not narrative or dictionary patches. Freeze the complete package with its Git commit and evidence links; this hash is only the AppSheet delta fingerprint.
- Keep source expressions literal and complete. Review artifacts before Git publication. Protected values require controlled external evidence and manual comparison; never insert secrets into this JSON or claim that matching redaction placeholders verifies private values. Such items stay explicitly pending/manual until the actual protected comparison is recorded.

The release scope record and review of integrated features/dependencies establish batch completeness. Use exact property evidence where a concrete need justifies it. The validator only verifies recorded entries; a green result cannot detect an omitted live change. No full app export is required. RC source-table/substitution inventory, matching PROD theme per app, source eligibility/containment, immutable versions and upgrade provenance are separate required evidence. The existing delta comparator accepts DEV/PROD observations only: record RC readbacks in the mapping/test records and link their evidence, never mislabel an RC UUID as DEV/PROD to make the comparator pass.

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
