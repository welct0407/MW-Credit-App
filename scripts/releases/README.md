# Release record helpers

## One checklist per release

Use the [current Open release](../../Documents/Release_Tracker.md#current-development-release). A helper does not allocate numbers, approve work or execute checks.

The [compact promotion template](templates/promotion-checklist.md) is the sole promotion record. Reuse an existing release copy; do not regenerate over evidence or add parallel design/batch/checklist files.

`node scripts/releases/checklist.mjs Rnnn outputs/<release>/promotion-checklist.md [affected Documents/path ...]`

The helper substitutes the release, repairs relative links and adds only explicitly affected document links. It refuses overwrite, outside-output paths, archive references and duplicates. There are no mandatory unchanged-document rows. A runner's machine-readable manifest remains the owner of exact artifact/configuration/SQL pins; link it rather than duplicate its contents.

Documentation-only work needs no product release or promotion record. A concise change log and checked publication suffice.

## Verification

After changing this helper/template, run `node --test scripts/releases/checklist.test.mjs`. It tests safe scoped generation, links and refusal cases. No product/browser/database suite is needed for that tooling edit.

Current exact model updates use [the YAML dictionary helper](../dictionary/README.md), only when model facts change. Retired AppSheet manifest/source-mapping templates are removed. Use the owning native delivery runner for machine manifests.
