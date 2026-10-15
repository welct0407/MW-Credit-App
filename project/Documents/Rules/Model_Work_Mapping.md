# Model work mapping

Owner preferences, updated **15 October 2026**. Read when assigning the automatic PWA team or selecting a model. A task-specific owner choice overrides these defaults; apply settings only through supported controls and disclose unavailable combinations.

## Select the model set for the active coding tool

- In **Codex**, use the **OpenAI/Codex** assignments below.
- In **Claude Code or another Claude-based coding tool**, use the **Claude alternative** below, including its orchestrator and escalation rules.
- In a tool supporting multiple providers, use the provider/model family selected by the owner for the current task. Determine it from the actual session configuration and supported model controls, not the repository name or historical agent settings. Ask only if the intended provider cannot be determined and changes the assignment.
- Select one set at task start and apply it consistently to the orchestrator and workers where supported. An explicit per-role or mixed-provider owner instruction takes precedence. Do not silently substitute providers or claim a requested model/effort ran when unavailable; disclose the limitation once and use a supported fallback under the orchestration policy.
- Keep an explicitly selected main-session model. If the tool cannot change its own orchestrator model, state the difference once and continue within supported controls; this document does not reconfigure an already-running session.

These are role-based alternatives, not measured one-to-one model or effort equivalences. Keep the same responsibilities, authority boundaries and proportional checks with either set.

## PWA team

Agents A–F are the standing PWA development team under the [six-agent process](PWA_Orchestration.md#six-agent-development-process). Activate them without another owner request, in waves when concurrency is limited. Keep assignments proportional and return not-applicable findings for unaffected surfaces; reuse workers and avoid duplicate roles. Agent names must include their role. Documentation-only/read-only tasks may use fewer roles; an explicit personal-execution request overrides the default.

### OpenAI / Codex assignments

The main conversation remains the orchestrator using the owner's selected session model/effort; the standing Codex worker assignments are:

| Name | Model ID | Effort | Scope |
| --- | --- | --- | --- |
| Agent A — Architect | `gpt-6-astra` | high | Design, technical direction and a compact executable test plan |
| Agent B — Coding | `gpt-6-astra` | medium | Application implementation and fixes |
| Agent C — Testing | `gpt-6.1-sol` | medium | Execute selected tests; report failures and retest corrections |
| Agent D — Miscellaneous / Delivery and Documentation | `gpt-6.1-sol` | medium | Own required maintenance of the full evolving-document set; tooling, delivery coordination and existing records |
| Agent E — User Experience Officer | `gpt-6-astra` | high | Automatically review affected UX; choose relevant desktop/iPhone Pro Max/iPad views; recommendations grouped by page/category with unique human-readable codes |
| Agent F — Infrastructure | `gpt-6-astra` | low | Terraform, cloud resources, IAM, Secret Manager and networking |

D does not replace F for infrastructure unless the owner requests it. E recommendations do not themselves authorize implementation.

### Claude alternative

Use the same A–F responsibilities above. The orchestrator is the main conversation, additional to the six workers.

| Name | Model ID | Effort |
| --- | --- | --- |
| Main conversation — Orchestrator | `claude-opus-5-5` | high |
| Agent A — Architect | `claude-opus-5-5` | high |
| Agent B — Coding | `claude-opus-5-5` | medium |
| Agent C — Testing | `claude-sonnet-5-5` | medium |
| Agent D — Miscellaneous / Delivery and Documentation | `claude-sonnet-5-5` | medium |
| Agent E — User Experience Officer | `claude-opus-5-5` | high |
| Agent F — Infrastructure | `claude-opus-5-5` | low |

Set effort explicitly through supported tool controls. Apply these task-specific escalations without a separate model-selection approval, unless the owner has explicitly fixed that task's setting:

- **B → Opus 5.5 / high** for difficult financial logic, concurrency or migrations.
- **C → Opus 5.5 / high** for subtle authorization, reconciliation or race-condition investigations.
- **F → Opus 5.5 / high** for ambiguous IAM/networking failures or shared DEV/PROD infrastructure changes. Keep low for clearly specified changes outside those cases.

Scope escalation to the affected assignment; subsequent routine assignments return to their defaults. A model escalation grants no additional production, data or service authority. Evaluate this starting allocation against actual task results; do not assume matching effort labels give matching behavior across providers.

Selection references, checked 15 October 2026: [Claude Opus](https://www.anthropic.com/claude/opus), [Claude Sonnet 5.5](https://www.anthropic.com/claude-sonnet-5-5), [Claude effort controls](https://platform.claude.com/docs/en/build-with-claude/effort). Tool availability may differ from API availability; verify supported controls before assignment.

## Other work — OpenAI / Codex

| Work | Model ID | Effort |
| --- | --- | --- |
| Ambiguous design, troubleshooting, on-call diagnosis | `gpt-6-astra` | high |
| Defined execution outside the PWA role mapping | `gpt-6.1-sol` | high |
| Verification, documentation, routine analysis | `gpt-6.1-sol` | medium |

For other work in a Claude-based tool, use the closest Claude role above: A for ambiguous design/diagnosis, B for implementation, C for verification, D for documentation/delivery and F for infrastructure, including the relevant escalation rule. Do not apply the OpenAI-only table in a Claude session.

The owner's six-agent instruction grants in-conversation delegation for PWA development. Model preferences grant no external contact, production or service authority. Follow platform controls and existing scoped owner instructions. Named outside agents need explicit owner authorization. Do not change unrelated chats or persistent service settings.

[Delivery policy](PWA_Orchestration.md) owns when an independent review is useful; [Development Workflow](Development_Workflow.md) owns location/access. Keep model preferences here, not competing historical tables. Editing this file changes future selection guidance, not an already-running agent.
