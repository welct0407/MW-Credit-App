# Model work mapping

Owner preferences, consolidated **14 October 2026**. Read when assigning the automatic PWA team or selecting a model. A task-specific owner choice overrides this table; apply settings only through supported controls and disclose unavailable combinations.

## PWA team

Agents A–F are the standing PWA development team under the [six-agent process](PWA_Orchestration.md#six-agent-development-process). Activate them without another owner request, in waves when concurrency is limited. Keep assignments proportional and return not-applicable findings for unaffected surfaces; reuse workers and avoid duplicate roles. Agent names must include their role. Documentation-only/read-only tasks may use fewer roles; an explicit personal-execution request overrides the default.

| Name | Model ID | Effort | Scope |
| --- | --- | --- | --- |
| Agent A — Architect | `gpt-6-astra` | high | Design, technical direction and a compact executable test plan |
| Agent B — Coding | `gpt-6-astra` | medium | Application implementation and fixes |
| Agent C — Testing | `gpt-6.1-sol` | medium | Execute selected tests; report failures and retest corrections |
| Agent D — Miscellaneous / Delivery and Documentation | `gpt-6.1-sol` | medium | Own required maintenance of the full evolving-document set; tooling, delivery coordination and existing records |
| Agent E — User Experience Officer | `gpt-6-astra` | high | Automatically review affected UX; choose relevant desktop/iPhone Pro Max/iPad views; recommendations grouped by page/category with unique human-readable codes |
| Agent F — Infrastructure | `gpt-6-astra` | low | Terraform, cloud resources, IAM, Secret Manager and networking |

D does not replace F for infrastructure unless the owner requests it. E recommendations do not themselves authorize implementation.

## Other work

| Work | Model ID | Effort |
| --- | --- | --- |
| Ambiguous design, troubleshooting, on-call diagnosis | `gpt-6-astra` | high |
| Defined execution outside the PWA role mapping | `gpt-6.1-sol` | high |
| Verification, documentation, routine analysis | `gpt-6.1-sol` | medium |

The owner's six-agent instruction grants in-conversation delegation for PWA development. Model preferences grant no external contact, production or service authority. Follow platform controls and existing scoped owner instructions. Named outside agents need explicit owner authorization. Do not change unrelated chats or persistent service settings.

[Delivery policy](PWA_Orchestration.md) owns when an independent review is useful; [Development Workflow](Development_Workflow.md) owns location/access. Keep model preferences here, not competing historical tables. Editing this file changes future selection guidance, not an already-running agent.
