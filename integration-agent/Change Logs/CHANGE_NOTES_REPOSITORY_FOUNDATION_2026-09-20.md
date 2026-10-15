# Repository foundation — 20 September 2026

## Scope and purpose

Created a separate Linux-native repository scaffold for the Debian 13 GCP integration-agent host. This avoids treating the Windows Partner Operations runtime as portable or active.

## Changes

- Added default-deny project instructions and revision-0 service catalogue.
- Added disabled example configuration with Linux external state/secrets paths and loopback-only binding.
- Added a minimal Python 3.13 package, fail-closed configuration/catalogue validation, CLI status, and unit tests.
- Added Debian prerequisite/Codex bootstrap and an install-layout script. Neither enables or starts a service.
- Added a disabled systemd one-shot verification unit, migration stages, operations/recovery boundaries, and a reuse/do-not-copy inventory.

## Rollback

Delete the unpublished local repository or archive the future GitHub repository. No VM, GCP resource, credential, webhook, AppSheet definition/data, message, or service was changed by this scaffold.

## Checks

- Four Python unit tests pass on Python 3.12, including fail-closed activation and loopback-only checks.
- Editable package installation, CLI configuration validation, and CLI status pass.
- Both POSIX shell scripts pass `sh -n`; JSON files parse; `git diff --check` passes.
- Repository secret/private-data review found paths and placeholders only; no credential values or borrower records are included.

## Status and remaining work

Repository foundation is locally verified. GitHub publication requires creating the new private repository and pushing this checkpoint. Runtime features, credentials, VM provisioning, GUI compatibility, service units, route cutover, and all activation remain separate work.
