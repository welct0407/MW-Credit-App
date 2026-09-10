# Project scripts and shared dependencies

Maintained automation belongs in scripts/. Generated files belong in outputs/.
Output documents, scripts and evidence are tracked by Git for recovery. Installed node_modules, Python caches and .tmp directories are ignored. The owner excluded C:\GitHub from Google Drive on 2026-09-10; uncommitted project files must not be assumed to have a Drive backup.

## Setup on this Windows VM or after recovery

1. Ask Codex to call load_workspace_dependencies to locate the current bundled Node, Python and Node package directory.
2. Run `powershell -NoProfile -File scripts/setup-dependencies.ps1 -DependencyRoot "<bundled Node node_modules directory>"` from the repository. The current host's default is provided by the script.
3. Run maintained JavaScript scripts with the bundled Node executable. Node resolves imports through the single repository-root node_modules junction. Do not install or copy node_modules into output folders.
4. Use the bundled Python executable for Python tooling. If a future script needs an additional package, document and pin it before installation; do not modify the shared Codex bundle.

The setup script checks artifact-tool 2.8.59, records bundle 26.909.12148 in dependency-runtime.json, refuses to overwrite an existing installation, and can be rerun safely. The manifest records the tested provider/version; it is not an npm lockfile or a complete offline copy of the bundle. Do not run npm install for the private @oai/artifact-tool package. After a bundle update, review compatibility before changing the recorded version.

## Historical script references

reference/ preserves the 47 Python/JavaScript scripts previously tracked under outputs/, with the same subdirectory structure and unchanged bytes. Originals remain on disk under outputs/. Their hashes and original paths are in reference-manifest.json.

These are historical recipes, not a batch of approved migrations to rerun. Some use hardcoded paths, script-relative companion files, or overwrite workbook/configuration documentation. Read and adapt a selected script before use; its original output files are tracked in Git, with Google Drive as additional recovery coverage. In particular, use the original script location when its relative paths require companion files. Do not execute historical update scripts as a dependency test.

The owner deleted the ten old output-local dependency installations on 2026-09-10. Both maintained scripts and original output scripts now resolve the shared root dependency junction. A read-only artifact-tool import and in-memory workbook creation from an output directory passed; this is not a compatibility guarantee for every historical script.

## Recovery

Clone the Git repository to recover committed outputs, then rerun setup-dependencies.ps1 using the current bundled runtime. Commit and push work that must survive loss of the VM; the project folder is no longer covered by Drive sync. Verify a representative read-only workflow before resuming modifications. Installed dependencies are not stored in the current Git tree. The separate MW-AI-Collection database backup to Drive does not back up this project's uncommitted files.
