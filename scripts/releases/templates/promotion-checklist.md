# {{RELEASE}} promotion record

Template revision: 14 October 2026. One copy per release; reuse an existing record. [Workflow](../../../Documents/Release_Workflow.md) · [Test selection](../../../Documents/PWA_Orchestration.md#proportional-validation) · [Recovery](../../../Documents/Release_Recovery_Runbook.md).

## Continue here

- Outcome/scope and affected components:
- State and next action or actual blocker:
- Source/artifact/configuration pins; runner manifest link:
- Existing owner authority and any explicit hands-on checkpoint:
- Previous deployed baseline and recovery:
- Scope freeze/next-number handoff:
- Checks: selected result/evidence, reused input-equivalent evidence and any real gap:

## Promotion

| Step | Completion evidence |
| --- | --- |
| Scope, target, authority and usable recovery confirmed | |
| Required affected checks passed or explicit owner deferral recorded | |
| Tested package captured; tracker freeze/handoff published | |
| Changed components deployed in dependency order | |
| Version/environment and affected PROD smoke verified once | |
| Actual outcome/changed owning facts recorded; intended publication and final tag verified | |

For SQL add the tested migration commit/hashes, full pending set, schema/history check, verified backup and guarded runner result. For infrastructure add the reviewed plan and actual apply/readback. For scheduler/notification changes add ownership, recipient isolation and execution/delivery evidence relevant to the change. Omit unrelated sections; do not create another checklist or document every unchanged service.

## Close

- Outcome: applied / verified / owner-accepted, with actual limitations:
- Recovery reference:
- Changed documents, if any:
- Published evidence/tag:
- Outstanding owner action, if any:

No AppSheet procedures apply. Documentation corrections alone need no new product test or deployment. Never fill a pending check as passed or replace a required result with a green badge from an unrelated run.
