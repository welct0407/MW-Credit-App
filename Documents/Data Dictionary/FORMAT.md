# Dictionary format 1

## Ownership and extension

`catalog.yaml` registers system IDs, allowed object kinds and coverage status. `systems/<system>/` owns system-specific definitions. Components distinguish apps, instances or databases when known. Object identity is the exact tuple `(system, component, kind, name, scope)`; filenames are stable navigation names. Keep exact source labels within the content. Never infer an instance identity from a product name.

The current namespaces are AppSheet, PostgreSQL, Metabase and Grafana. `workbook-evidence` holds mixed source material that cannot be assigned a current system/environment meaning without reconciliation. A planned system has no claimed inventory. To add another app, register its ID and kinds, create a README documenting coverage and the content contract, then add definitions with evidence. Change its status to `active` before validating actual objects. Reuse the shared envelope and tools. Introduce new validation rules where that system has structural requirements.

Use one file per substantial object: table, model, dashboard or alert rule. Small related settings can share a named group. Avoid one file per property and avoid a single ecosystem-wide inventory file.

## Common envelope

Illustrative new object (not a claim about an existing Grafana dashboard):

```yaml
"format": 1
"identity":
  "system": "grafana"
  "component": "exact-instance-reference"
  "kind": "dashboard"
  "name": "exact-dashboard-uid"
  "scope": "production"
"verification":
  "status": "documented"
  "source": "relative/path/to/saved-evidence.md"
"content":
  "title": "Example dashboard"
  "panels": {}
```

Every identity field is a nonempty string. `verification.status` is `imported-unreconciled` or `documented`; it describes documentation provenance, not release readiness. Keep the source reference explicit. `content` is a mapping. Optional `evidence` maps exact content JSON Pointers to a reference, reason and value/absent state for subsequent targeted changes. Object-level imported status remains until an explicit reconciliation.

YAML is restricted to JSON-compatible values: mappings with unique string keys, ordered lists, strings, finite numbers, booleans and null. Quote text, including Yes/No, numeric-looking IDs, timestamps and expressions. Use literal `|` blocks for multiline strings; preserve trailing newlines with the appropriate YAML chomping indicator. The writer roundtrips every emitted value before saving. Do not use anchors, aliases, tags or merge keys. Property names containing dots remain exact keys; a dot does not implicitly create another nesting level.

`null`, `""`, `false`, `0` and an absent mapping key have distinct meanings. In migrated content, null means the recorded Excel cell was empty; it does **not** establish that a live property is unset or inherited. Future explicitly unknown/inherited/removed properties use a documented state record such as `{"state":"unknown"}` or `{"state":"inherited","effective":"..."}`. Do not convert ordinary source values into these states without evidence.

## Imported content contracts

| Object | Content structure |
| --- | --- |
| AppSheet table | `source_app`, `source_table`, optional `binding`; `columns.<exact name>.inventory`, `.rules.<exact property>`, `.relationship` |
| AppSheet slice | Original `definition`; `members` is a source-ordered list with original `Ordinal` and `Column` values |
| AppSheet settings | Original `sheet`; `records.row-NNNNN` contains the original header/value mapping |
| PostgreSQL relation | `columns.<exact name>` and `constraints.<exact name>` contain original header/value mappings |
| Recorded database logic | Original `sheet`; `records.row-NNNNN` grouped by exact `Schema / table` label |
| Metabase model | `fields.<exact field or Model grain>` contains original header/value mappings |
| Workbook evidence | Original `sheet`; `records.row-NNNNN` preserves each original row and label |

Inventory fields and similarly named rule fields remain in their original namespaces. The migration does not assume they are synonyms, deduplicate them, apply supplements or choose a winner. Missing inventory or rule coverage remains missing. SQL source labels such as `DEV Business Expenses` are preserved exactly, without inferring a physical relation or database.

At initial import, the exceptional Excel formula was represented as `{"excel_formula":"=...","cached_value":"..."}`. Owner-authorized cleanup later normalized that single constant to `ADDS_AND_UPDATES`, because its literal and cached value agree; exact original values remain in migration evidence. This does not authorize evaluating or rewriting other expressions. Other cell annotations/structural features are accounted for in the source manifest and frozen workbook. The migration's row map records destinations at migration commit `faa51d2`; later documented edits or deletions may change those destinations. Header order and row positions are recorded in the manifest. Blank formatting rows and workbook styling stay in the frozen workbook.

## Development and historical evidence

Imported differences and supplements remain under `imports/` with their original labels. They are excluded from automatic environment overlays and current-state inference. Later verified DEV deltas belong under `development/`, with a release reference, exact target identity and explicit before/after states. They may use the registered system/object envelope, but do not mix them into a baseline file or claim a tool-computed effective configuration. A future reconciliation can establish canonical production definitions and structured active deltas within its own scope.

## Validation and references

Validation rejects malformed YAML, duplicate keys/identities, unregistered systems/kinds, invalid content containers, invalid slice ordinals, stale navigation indices and a changed frozen workbook. It validates the common envelope and imported structural contracts. It does not parse arbitrary AppSheet expressions or SQL, prove live correctness, or fill missing coverage.

Ref relationships, constraint definitions and source links are retained exactly. Semantic referential validation is deferred with reconciliation: a missing base column might be defined in a supplement, and imported database labels do not establish current physical identities. Existing ambiguity is recorded in `unresolved.yaml`; it must not be silently repaired to make a structural check pass.

The register separates `deferred` reconciliation topics, `resolved` cleanup items, and `informational` future coverage. Validation counts these separately; a deferred topic is not an import failure. Original migration verification establishes complete source coverage independently.

`index.json` is derived and contains only identity, status and lookup locations. Rebuild it with the helper. Keep UTF-8 text and stable property ordering; normal edits should affect only the requested object and its evidence. No generated Excel mirror is maintained.
