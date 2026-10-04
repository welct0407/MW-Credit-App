# R050 interest reallocation candidate — 4 October 2026

The owner approved implementing a supported bookkeeping correction mechanism.
V57 adds a direct-postgres, same-loan whole-interest operation with full expected
before-state, append-only transaction audit, exact transition permits, existing
locks/calculation guards, atomic rollback and duplicate-safe reconciliation.
Ordinary posted allocation/repayment writes remain blocked. No live data, code,
access, secrets, cash totals, notifications or VM-controller state were changed.

The candidate includes regression and concurrency checks in the existing CI
entry points. [Contract, validation and production plan](../outputs/r050-interest-reallocation/README.md).
R050 remains Open; this task creates no successor/freeze, merge or production
release. Live DEV/PROD remain V56. Production migration approval, restored-copy
rehearsal and fresh private before-state are required before the authorized
bookkeeping adjustment can be executed. Only generic source and synthetic
validation evidence are prepared for the task branch/draft PR. Publication is
blocked: automatic approval review rejected GitHub branch creation twice, citing
the original bookkeeping scope as excluding source publication, despite the
continuation requesting task-source publication. No GitHub branch or PR was
created. Local source and validation remain available for explicit reauthorization.

## Approval continuation

A subsequent delegation supplied quoted owner approval for draft-PR publication
and V57 deployment after all required checks. The single permitted retry of
GitHub branch creation was rejected again: automatic approval review treated the
quoted approval in delegation content as untrusted rather than a direct user
message. Publication is stopped; no alternate route was attempted. GitHub CI is
unavailable, so dependent deployment/data writes remain blocked. Source/tests
are unchanged from the validated pin. A final restricted-reader check confirms
the correction function is absent and the existing allocation remains unchanged.

## Direct owner authorization

On 4 October the owner directly instructed: publish the correction branch and
draft PR, deploy V57 after all required checks pass, then perform the scoped
allocation correction. This resolves the authorization-provenance blocker.
GitHub task-branch creation succeeded; publication/CI and live checks proceed
under that bounded approval. No merge/default push or unrelated operation is
authorized. Detailed financial evidence remains private.
