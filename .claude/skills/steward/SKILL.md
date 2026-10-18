---
name: steward
description: Repository conventions for driving a pull request this session opened in welct0407/MW-Credit-App to green. Read before acting on CI or review events; it decides how proactive to be and what counts as evidence.
---

# Stewarding a pull request in MW-Credit-App

These conventions apply the [lean check routine](../../../project/Documents/Rules/PWA_Orchestration.md#lean-check-routine) to CI and review events. They never relax the hard rules in `AGENTS.md`.

## Evidence first

- `Development checks` reuses evidence on its own (`scripts/ci/reuse-evidence.mjs`): a stage that passed on this commit, a parent or an earlier head of the branch with identical stage-relevant files is skipped, and the run's step summary links the run that holds the evidence. A skipped stage with linked evidence is a pass; cite that run. Only a stage marked `no evidence` ran now.
- Before a push, run only the fast checks the diff invalidates (lint, type check, the unit tests for the changed files), in a clean tree. A check that already passed on the same tree in this session is not run again.
- Never run the full Playwright suite locally. To reproduce a CI failure, run the failing spec (or the failing database group) only.

## One push per verified batch

- Finish the batch, the fixes and the change note, then push once. Do not push a commit to start CI "for a look", and do not push record-only commits one by one; CI reuses evidence for them, but every push still wakes this session several times.
- Merge `main` into the branch only to resolve a conflict. Branch protection on `main` requires the `Development checks result` status and does not require an up-to-date branch.
- Never dispatch a workflow by hand when a run on an input-equivalent commit exists, and never re-run a green job. One re-run of a failed job in total, and only for the cases the harness rules allow.

## Waiting

- Do not poll. PR events wake this session; a check-in scheduled by the harness is the fallback. No sleep loops, no log watchers, no sub-agent whose task is to wait. Expected durations: `check` about 5 minutes, each e2e shard about 8, a database group about 15.
- When CI is green and the PR only waits for the owner, say so once and stop.

## Review events

- A review bot's optional or nit finding rides the next code push, if one comes; it never starts a push on its own.
- A failing third-party scan on a historic commit (for example a secret scanner naming an earlier commit) cannot be cleared by a push: report it once on the PR and stop.
