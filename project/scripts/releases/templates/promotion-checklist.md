# {{RELEASE}} promotion record

Template revision: 25 October 2026. One copy per release; reuse an existing record. [Workflow](../../../Documents/Rules/Release_Workflow.md) · [Test selection](../../../Documents/Rules/PWA_Orchestration.md#proportional-validation) · [Recovery](../../../Documents/Rules/Release_Recovery_Runbook.md).

## Continue here

- Outcome/scope and affected components:
- State and next action or actual blocker:
- Source/artifact/configuration pins; runner manifest link:
- Existing owner authority and any explicit hands-on checkpoint:
- Previous deployed baseline and recovery:
- Scope freeze pin and next number (published with the closure pull request):
- Checks: selected result/evidence, reused input-equivalent evidence and any real gap:

## Promotion

| Step | Completion evidence |
| --- | --- |
| Scope, target, authority and usable recovery confirmed | |
| Required affected checks passed or explicit owner deferral recorded | |
| Tested package captured; freeze pinned in this record | |
| Changed components deployed in dependency order | |
| Version/environment and affected PROD smoke verified once | |
| Final tag created on the package commit; actual outcome/changed owning facts recorded; closure pull request (freeze, record, tag record, prune) published once | |

PROD image build: `gcloud builds submit --config cloudbuild-business.yaml --substitutions=_MW_RELEASE=Rnnn,_MW_SOURCE_COMMIT=<40 lowercase hex package commit>` plus the usual project, region, service account and source-staging flags; the build refuses unless `_MW_RELEASE` matches `^R\d{3}$` and `_MW_SOURCE_COMMIT` is 40 lowercase hex. At closure run the [component versions](../../../Documents/Rules/Release_Workflow.md#component-versions-r144-onwards) steps (derive, render, drift).

For SQL add the tested migration commit/hashes, full pending set, schema/history check, verified backup and guarded runner result. For infrastructure add the reviewed plan and actual apply/readback. For scheduler/notification changes add ownership, recipient isolation and execution/delivery evidence relevant to the change. Omit unrelated sections; do not create another checklist or document every unchanged service.

## Close

- Outcome: applied / verified / owner-accepted, with actual limitations:
- Recovery reference:
- Changed documents, if any:
- Published evidence/tag (the one closure pull request):
- Outstanding owner action, if any (acceptance is recorded in the next closure or product pull request, not its own):

No AppSheet procedures apply. Documentation corrections alone need no new product test or deployment. Never fill a pending check as passed or replace a required result with a green badge from an unrelated run.
