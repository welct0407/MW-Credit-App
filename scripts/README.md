# Project scripts and shared dependencies

Maintained automation belongs in scripts/. Generated files belong in outputs/.
Both outputs/ and node_modules/ are ignored by Git. The owner manages Google Drive backup of output files; a Git clone alone does not recover them.

## Setup on this Windows VM or after recovery

1. Ask Codex to call load_workspace_dependencies to locate the current bundled Node, Python and Node package directory.
2. Run `powershell -NoProfile -File scripts/setup-dependencies.ps1 -DependencyRoot "<bundled Node node_modules directory>"` from the repository. The current host's default is provided by the script.
3. Run maintained JavaScript scripts with the bundled Node executable. Node resolves imports through the single repository-root node_modules junction. Do not install or copy node_modules into output folders.
4. Use the bundled Python executable for Python tooling. If a future script needs an additional package, document and pin it before installation; do not modify the shared Codex bundle.

The setup script checks artifact-tool 2.8.59, records bundle 26.909.12148 in dependency-runtime.json, refuses to overwrite an existing installation, and can be rerun safely. The manifest records the tested provider/version; it is not an npm lockfile or a complete offline copy of the bundle. Do not run npm install for the private @oai/artifact-tool package. After a bundle update, review compatibility before changing the recorded version.

## Historical script references

reference/ preserves the 47 Python/JavaScript scripts previously tracked under outputs/, with the same subdirectory structure and unchanged bytes. Originals remain on disk under outputs/. Their hashes and original paths are in reference-manifest.json.

These are historical recipes, not a batch of approved migrations to rerun. Some use hardcoded paths, script-relative companion files, or overwrite workbook/configuration documentation. Read and adapt a selected script before use; obtain its data/evidence from the owner's Drive backup. In particular, copying a script back to its original location may be necessary for its original relative paths. Do not execute historical update scripts as a dependency test.

Existing output-local dependency installations remain on disk by owner instruction and take precedence for scripts run from those folders. New maintained scripts under scripts/ use the shared root junction. Removing the old installations is a separate cleanup step.

## Recovery

Clone the Git repository, restore outputs/ from the existing Google Drive backup, and rerun setup-dependencies.ps1 using the current bundled runtime. Verify a representative read-only workflow before resuming modifications. Git does not back up outputs/ or installed dependencies. No new backup destination or schedule is configured by this change.
