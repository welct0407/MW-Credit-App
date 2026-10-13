# Export the dictionary for ChatGPT

## Generate one upload file

1. In File Explorer, open the repository's `scripts` folder.
2. Double-click **Export Data Dictionary.cmd**.
3. Wait for **Export complete**. The window shows the output location and stays open until you press a key.
4. Upload **Documents/Data_Dictionary_ChatGPT.md** to your ChatGPT Project. Replace its previous snapshot when you regenerate.

The [launcher](../../scripts/Export%20Data%20Dictionary.cmd) works regardless of the starting folder. You can create a Windows shortcut to this launcher for your desktop. The output has the same predictable filename each time and is replaced only after successful generation and source verification.

## What is included

- Every dictionary YAML/YML definition and metadata file, across all systems, imports and development scopes.
- Dictionary Markdown guides and the system registry, including planned-system status and unresolved/resolved items.
- The current Solution Design, PWA Data Model Overview and Development Changes documents.
- Contents links, source paths, the Git baseline, export time, source hashes and a list of included uncommitted source files.

Source text is reproduced completely inside labeled code blocks. Exact expressions, types, lists, nested metadata and evidence survive intact. New systems/kinds registered in the shared format are discovered automatically; they do not need a new exporter. Unknown format versions, malformed YAML and unregistered kinds fail clearly rather than producing a partial reference. The current supported contract is [dictionary format 1](../Data%20Dictionary/FORMAT.md).

The export is a snapshot of the working files, including any uncommitted dictionary/context changes. Those changes are labeled inside. Imported-unreconciled data remains labeled, and dated supplements are not applied as current values. Linked repository evidence outside the included files is identified by path but is not automatically embedded. Derived navigation JSON, the old Excel workbook, binaries and archived artifacts are excluded.

## Local operation and recovery

Generation uses the installed Python runtime and pinned YAML parser. It makes no AI/API/network calls. It does not modify the dictionary, commit/push Git changes, or upload anything to ChatGPT. The generated Markdown is intentionally ignored by Git: the reusable scripts and maintained sources are published; this disposable upload copy can be regenerated. No Codex conversation is needed to run it.

If generation fails, read the message in the open window. The previous export is retained for input/validation failures. If source files changed during generation, run it again after the edit finishes. A competing exporter is blocked by a `.md.lock` file; after a crashed process has stopped, remove that specific lock file and retry.

On a restored or different machine, follow the [runtime setup](../../scripts/dictionary/README.md#runtime). The launcher uses the existing bundled Python by default. Set `MW_DICTIONARY_PYTHON` to another compatible Python executable if needed; `MW_DICTIONARY_PYTHON_PACKAGES` can point to the externally installed pinned parser. The launcher never installs dependencies or changes system execution policy; its PowerShell policy override applies only to that process.

For scripted execution without the final keypress:

```powershell
& '.\scripts\Export Data Dictionary.cmd' --no-pause
```

Only regenerate when relevant source files change. Bring the final feature design and its snapshot's commit/fingerprint back to the implementation task so it can identify assumptions and intervening changes.
