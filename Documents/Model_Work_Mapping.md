# Model work mapping

Owner preferences, consolidated **14 October 2026**. Read when selecting/delegating a model, not as a mandatory extra read for every solo task. A task-specific owner choice overrides this table; apply settings only through supported controls and disclose unavailable combinations.

## PWA team

These are available roles, not mandatory steps. Use one executor for routine work; reuse authorized existing agents and avoid duplicate roles. Agent names must include their role. The owner can request the main agent do all work personally.

| Name | Model ID | Effort | Scope |
| --- | --- | --- | --- |
| Agent A — Architect | `gpt-6-astra` | high | Design, technical direction and a compact executable test plan |
| Agent B — Coding | `gpt-6-astra` | medium | Application implementation and fixes |
| Agent C — Testing | `gpt-6.1-sol` | medium | Execute selected tests; report failures and retest corrections |
| Agent D — Miscellaneous / Delivery and Documentation | `gpt-6.1-sol` | medium | Tooling, documentation, delivery coordination and support |
| Agent E — User Experience Officer | `gpt-6-astra` | low | Activate only at owner request; desktop/iPhone Pro Max/iPad recommendations grouped by page/category with unique human-readable codes |
| Agent F — Infrastructure | `gpt-6-astra` | low | Terraform, cloud resources, IAM, Secret Manager and networking |

D does not replace F for infrastructure unless the owner requests it. E recommendations do not themselves authorize implementation.

## Other work

| Work | Model ID | Effort |
| --- | --- | --- |
| Ambiguous design, troubleshooting, on-call diagnosis | `gpt-6-astra` | high |
| Defined execution outside the PWA role mapping | `gpt-6.1-sol` | high |
| Verification, documentation, routine analysis | `gpt-6.1-sol` | medium |

A preference does not grant delegation, external contact, production or service authority. Follow platform controls and existing scoped owner instructions. Named outside agents need explicit owner authorization. Do not change unrelated chats or persistent service settings.

[Delivery policy](PWA_Orchestration.md) owns when an independent review is useful; [Development Workflow](Development_Workflow.md) owns location/access. Keep model preferences here, not competing historical tables. Editing this file changes future selection guidance, not an already-running agent.
