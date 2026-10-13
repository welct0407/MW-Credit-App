# Release record helpers

## One checklist per release

Use the [current Open release](../../Documents/Release_Tracker.md#current-development-release). A helper does not allocate numbers, approve work or execute checks.

The [compact promotion template](templates/promotion-checklist.md) is the sole promotion record. Reuse an existing release copy; do not regenerate over evidence or add parallel design/batch/checklist files.

Creating any new record or machine-readable manifest requires explicit owner approval for that document. The command below creates a document: run it only after that approval. A template, release number or deployment approval does not grant creation authority. If no record exists, prepare its proposed path, purpose and content in chat or an existing record first; do not bypass required delivery validation while approval is pending.

`node scripts/releases/checklist.mjs Rnnn outputs/<release>/promotion-checklist.md [affected Documents/path ...]`

The helper substitutes the release, repairs relative links and adds only explicitly affected document links. It refuses overwrite, outside-output paths, archive references and duplicates. There are no mandatory unchanged-document rows. A runner's machine-readable manifest remains the owner of exact artifact/configuration/SQL pins; link it rather than duplicate its contents.

Documentation-only work needs no product release or promotion record. Update an existing appropriate change/development record and verify publication; do not create a new log without explicit owner approval.

## Verification

After changing this helper/template, run `node --test scripts/releases/checklist.test.mjs`. It tests safe scoped generation, links and refusal cases. No product/browser/database suite is needed for that tooling edit.

Current exact model updates use [the YAML dictionary helper](../dictionary/README.md), only when model facts change. Retired AppSheet manifest/source-mapping templates are removed. Use the owning native delivery runner for machine manifests.
