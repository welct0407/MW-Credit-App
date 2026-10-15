# Debian VM connectivity diagram — 2026-09-21

## Scope and purpose

Add a maintained Draw.io architecture view of `vm-mw-credit-agent` and its current administrative, webhook, data, delivery, telemetry, source-control and backup connectivity.

Starting Git commit: `0c3b62ae82f43f43eed005c4806bc965672a8a76`.

## Changed files

- `scripts/generate-vm-connectivity-architecture.py`: reproducible single-page Draw.io generator.
- `docs/VM_CONNECTIVITY_ARCHITECTURE.drawio`: authoritative editable diagram.
- `docs/VM_CONNECTIVITY_ARCHITECTURE.png`: rendered preview.
- `docs/VM_CONNECTIVITY_ARCHITECTURE.md`: scope and regeneration command.
- `README.md`: diagram entry point.

The diagram records the implemented architecture only. It does not change a firewall, listener, credential, integration, service or business activation state.

## Verification

The generator completed, the XML parsed, Draw.io exported the PNG, and the rendered page was visually reviewed for readable labels, contained objects and distinguishable allowed, management and blocked paths.

## Rollback

Remove the four diagram artifacts and the README link, or restore the affected files from the starting commit. No runtime rollback is required.

Status: complete.
