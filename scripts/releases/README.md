# Release record helpers

## One checklist per release

Use the [current Open release](../../Documents/Release_Tracker.md#current-development-release). A helper does not allocate numbers, approve work or execute checks.

The [compact promotion template](templates/promotion-checklist.md) is the sole promotion record. Reuse an existing release copy; do not regenerate over evidence or add parallel design/batch/checklist files.

The owner's deployment/migration instruction authorizes its required technical records. Reuse existing records; if the required promotion checklist or machine-readable manifest is missing, create it without a second approval using the command below or the owning runner. This also covers necessary private backup/recovery, maintenance/restoration, preflight, deployment and verification receipts. Optional new documents still need approval; do not bypass delivery validation.

`node scripts/releases/checklist.mjs Rnnn outputs/<release>/promotion-checklist.md [affected Documents/path ...]`

The helper substitutes the release, repairs relative links and adds only explicitly affected document links. It refuses overwrite, outside-output paths, archive references and duplicates. There are no mandatory unchanged-document rows. A runner's machine-readable manifest remains the owner of exact artifact/configuration/SQL pins; link it rather than duplicate its contents.

Documentation-only work needs no product release or promotion record. Update an existing appropriate change/development record and verify publication; do not create a new log without explicit owner approval.

## Verification

After changing this helper/template, run `node --test scripts/releases/checklist.test.mjs`. It tests safe scoped generation, links and refusal cases. No product/browser/database suite is needed for that tooling edit.

Current exact model updates use [the YAML dictionary helper](../dictionary/README.md), only when model facts change. Retired AppSheet manifest/source-mapping templates are removed. Use the owning native delivery runner for machine manifests.
