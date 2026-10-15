# Prototype Design Principle — 2026-08-31

## Status

Implemented in the project instructions. No AppSheet app, database, automation, Looker Studio report, or production data was changed.

## Scope and purpose

Updated `AGENTS.md` to establish that the loan solution is a prototype and does not automatically need to follow accounting standards or regulatory rules.

The instruction now directs future Codex work to:

- prioritize the user's stated prototype behavior, usability, iteration speed, learning value, and internal consistency;
- treat accounting and regulatory practices as optional references or risk considerations unless explicitly requested;
- allow intentional, documented, understandable, and reversible simplifications or experiments;
- avoid expanding tasks into production-grade accounting or compliance implementations without user direction; and
- avoid representing prototype outputs as compliant, approved, legally sufficient, or production-ready without independent confirmation.

Existing safeguards for data protection, dependency integrity, auditability, least privilege, and reversibility remain in effect.

## Files changed

- `AGENTS.md`
- `Change Logs/CHANGE_NOTES_PROTOTYPE_DESIGN_PRINCIPLE_2026-08-31.md`

## Rollback point

The rollback point is the tracked `AGENTS.md` content immediately before this change. No AppSheet or Looker Studio version rollback is applicable.

## Checks performed

- Confirmed the instruction is located in the essential implementation rules where it governs future design decisions.
- Confirmed the final conflict-resolution rule defines financial correctness relative to the user's documented prototype logic rather than automatic external compliance.
- Confirmed no data-model document update is required because no table, column, relationship, slice, or app configuration changed.

## Manual testing required

No application testing is required. Future Codex changes should be reviewed against this principle during planning and implementation.

## Rollback instructions

Remove the four prototype-design bullets added under `Essential implementation rules` and restore the prior final conflict-resolution paragraph in `AGENTS.md`. Then update this change log to record the rollback.
