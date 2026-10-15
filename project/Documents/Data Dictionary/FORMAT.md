# Dictionary format 1

`catalog.yaml` registers systems/kinds. Each YAML file under `systems/<system>/` owns one substantial object or coherent contract. Identity is the exact tuple (system, component, kind, name, scope). All five values are nonempty strings.

Required envelope:
- `format: 1`
- `identity`: the five fields above
- `verification`: status (`documented` or `imported-unreconciled`) and explicit source
- `content`: mapping of exact definitions or source-backed contract values

Optional `evidence` maps content JSON Pointers to reference, reason and value/absent state. A documented source is not proof of current live correctness. Do not claim a capture from a migration-source review.

Use JSON-compatible YAML only: unique string keys, ordered lists, strings, finite numbers, booleans and null. No aliases, tags or merges. Preserve exact identifiers, literal SQL, list order and the difference between absent/null/blank/false/zero.

PostgreSQL relation content holds definition, columns, constraints, indexes, triggers, policies and dependencies. Routines hold exact signature/body and evidenced metadata. PWA contract objects name route/data/ownership rules and immutable source references; do not copy full application implementations into parallel specifications.

Add a system and allowed kinds before its objects. Keep one current definition; remove superseded snapshots/imports. Rebuild `index.json` and validate. The index is navigation, never another authority. No Excel mirror is maintained.