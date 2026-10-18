# Change notes — Build-time release number (R075 tooling), 18 October 2026

## Purpose
The About release number lived in `apps/pwa/src/release.ts`, so every freeze and closure needed a code edit and a closure pull request ran checks only for that bump. The number is now a build input, so closures are records-only.

## Changes
- Build: a `__RELEASE_NUMBER__` define. The PROD (`live-prod`) build requires `MW_RELEASE_NUMBER=Rnnn` and fails without it; the promotion's candidate build passes the package's `release`. DEV and CI builds show `dev` unless the variable is set.
- `apps/pwa/src/release.ts` becomes a fixed accessor of the define. `build-version.json` stays `schemaVersion: 1` and gains a `release` key, because installed R074 clients reject any other schemaVersion, which would put the app in an error state and block updates.
- Runner: the R075 contract (schemaVersion 16, baseline R074 `b88653d`, R074 rules) also proves the artifact carries the promoted release, from the sidecar and the entry bundle. The candidate build takes `releaseNumber`.
- Closures no longer touch code, so a closure pull request is records-only and needs no check, lint or e2e run.
- Consumers of the marker: the app update check (`usePwa.ts`) is unchanged. The DEV deploy (`scripts/deploy-hosting.mjs`) requires `schemaVersion: 1` plus `release`, and the R075 runner checks `exact({schemaVersion:1, version, entry, release})`.
- `npm run build:live-dev` runs `scripts/build-live-dev.mjs` (the tracker's Open release unless `MW_RELEASE_NUMBER` is set); CI's `vite build --mode live-dev` builds show `dev`; `buildProductionBusinessCandidate` needs `releaseNumber`. Documented in `docs/Development.md` and `docs/Development_PWA_Delivery.md`.
- Code, build and runner are Byte's. Documents updated: `docs/Development.md` and `docs/Development_PWA_Delivery.md` (build input), `project/Documents/Rules/Release_Workflow.md` (freeze step 2 replaces the keep-and-bump sentence and the release-constant unit test rule), `scripts/promotion/README.md` (R075 contract section), `project/Documents/Development_Changes.md` (delivery tooling status row).

## Checks
| Command | Result |
| --- | --- |
| Unit tests | Pass, 641/641 (includes the installed-R074-client marker test) |
| `npm run typecheck` | Exit 0 |
| `npm run build` and `npm run build:live-dev` | Exit 0; `R075` in the sidecar and the bundle |
| `npx biome lint` (changed files) | Exit 0, 1 pre-existing warning |
| About e2e spec | Pass, 8/8 |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |
| Chase's review | One high finding fixed: a v2 marker would have broken installed R074 clients, so the marker stays v1 with an extra key. Two low findings accepted: the bundle check matches any quoted occurrence of the release, but the sidecar and the define share one variable; an exported `MW_RELEASE_NUMBER` in a developer shell labels DEV and CI builds, which is cosmetic and cannot reach PROD |
| Development checks | The pull request's run |

## Not run
The R075 runner contract is not exercised against PROD before the R075 promotion; the `live-prod` build failure without the variable is covered by the unit tests only.

## Recovery
Revert the batch commit; `release.ts` returns to a literal that each freeze and closure bumps.

## Open questions
None.

## Remaining work
None.
