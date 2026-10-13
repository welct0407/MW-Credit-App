# Non-AI dictionary exporter — 23 September 2026

## Scope and purpose

Owner requested a non-AI exporter with a double-click launcher inside the repository and an easy-to-find single Markdown output under Documents, compatible with current and future ecosystem systems. The output supports feature-design discussions in ChatGPT while YAML remains the maintained dictionary.

## Changes

- Added `scripts/Export Data Dictionary.cmd`, `scripts/dictionary/Export-DataDictionary.ps1` and `export_markdown.py`. The launcher finds the existing bundled Python independently of the current directory, displays success/failure, and waits for a keypress. Runtime overrides and recovery are documented.
- Generates local `Documents/Data_Dictionary_ChatGPT.md` on demand. This owner-requested Documents output is ignored by Git, including its transient lock; script runs do not create commits or duplicate maintained data in Git.
- Includes complete YAML/YML sources across all systems plus dictionary guidance, Solution Design, Model Overview and Development Changes. Adds a contents index, system coverage, exact source paths/hashes, Git baseline, generation time and uncommitted-source disclosure.
- Uses the common format/registry without a product-specific property list. Supports arbitrary nested content and registered future systems/kinds. Preserves expressions, literal types and order. Rejects unsupported envelope versions, invalid sources and duplicate identities.
- Verifies each embedded source byte-for-byte, checks for concurrent source changes, protects handwritten/source outputs, prevents competing exports and atomically publishes the Markdown. No AI/network calls, live app access, dictionary writes or Git mutations occur.
- Added export tests and [user instructions](../Documents/Rules/Data_Dictionary_Export.md), and updated documentation/script entry points.

## Rollback and concurrent work

Starting commit: `311fa9986287a9f4ab234aafcd24c1df0219330f`. Pre-existing R016 Metabase/dictionary/scripts/evidence changes were present, with further edits occurring during this task. Their source files and index are outside this implementation's write scope; they are read as snapshot inputs only. Only exporter files and specifically affected guide/config entries are staged for this task.

Rollback uses a normal revert of the exporter commit, preserving subsequent work. The disposable Markdown can be regenerated or removed independently. No live backup or rollback is required.

## Verification and status

Verification results are recorded in [exporter checks](../outputs/dictionary-export-20260923/verification.json): synthetic multi-system/future-kind coverage, exact embedded content, invalid-source rejection, source-change protection, output preservation, concurrent lock, deterministic rendering, the Windows launcher and the actual generated snapshot. No AppSheet reconciliation was performed.

Implementation and verification complete: all 9 exporter tests and the 22-test combined dictionary suite passed. The Windows launcher succeeded from outside the repository, its missing-runtime path failed clearly, and the actual 192-object / 203-source-file export passed byte-exact extraction checks. All 61 affected-document links resolve. Repository publication follows the standing normal commit/push rule; the generated upload remains local by design. New format versions need an explicit exporter compatibility update; merely adding a registered system/kind in format 1 does not.
