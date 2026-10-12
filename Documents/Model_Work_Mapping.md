# Model work mapping

Owner-maintained routing preferences for Dots, effective **2 October 2026 (Asia/Bangkok)**. Edit the applicable row below to change future task assignments. This is the single source for model/effort defaults; [Dots Orchestration Rules](Dots_Orchestration_Rules.md) explains when to read it, and [Development Workflow](Development_Workflow.md) selects the execution environment.

## Assignments

| Work category | Use for | Model | Model ID | Reasoning effort | Effort value |
| --- | --- | --- | --- | --- | --- |
| Design | Architecture, new workflow/report design, ambiguous requirements, trade-offs and complex design review | GPT-6 Astra | `gpt-6-astra` | High | `high` |
| Troubleshooting | Root-cause analysis, unexplained failures, conflicting evidence and recovery planning | GPT-6 Astra | `gpt-6-astra` | High | `high` |
| On-call support | Incident triage, impact assessment, diagnosis and recovery decisions during an active support task | GPT-6 Astra | `gpt-6-astra` | High | `high` |
| Execution | Implement an understood change; code, SQL, configuration, UI work and authorized operations following a settled plan | GPT-6.1 Sol | `gpt-6.1-sol` | High | `high` |
| Verification | Run relevant checks, review implementation against agreed requirements, inspect results and reconcile evidence | GPT-6.1 Sol | `gpt-6.1-sol` | Medium | `medium` |
| Documentation and routine analysis | Scoped documentation, release evidence, summaries and defined data analysis | GPT-6.1 Sol | `gpt-6.1-sol` | Medium | `medium` |

## Routing decisions

- **PWA D/F split — owner revision, 11 October 2026 (Asia/Bangkok):** Agent D — Miscellaneous / Delivery and Documentation uses **GPT-6.1 Sol / `gpt-6.1-sol` / Medium / `medium`** for miscellaneous execution, tooling, documentation, evidence and delivery coordination. F uses **GPT-6 Astra / `gpt-6-astra` / Low / `low`** for Terraform, cloud resources, IAM, Secret Manager, networking and infrastructure configuration. F was activated for the scoped11October DEV continuation; transient worker IDs are retained in session evidence only. This supersedes D's earlier infrastructure responsibility only. E remains request-only for desktop, iPhone Pro Max and iPad UX review. Existing scoped production/service authority applies. See [PWA responsibilities](PWA_Orchestration.md).

- **PWA UX officer — owner revision, 11 October 2026 (Asia/Bangkok):** E `agent_e_user_experience` uses **GPT-6 Astra / `gpt-6-astra` / Low / `low`** for owner-requested user-experience review and suggestions only. Supply unique human-readable codes grouped by page. No automatic activation or product implementation without owner approval. A–D assignments remain unchanged; this named authorization extends the retained roster only for E. See [PWA responsibilities](PWA_Orchestration.md).

- **PWA team override — owner revision, 8 October 2026 (Asia/Bangkok):** A remains **GPT-6 Astra / `gpt-6-astra` / High / `high`** for design and an executable test plan alongside each design; B remains **GPT-6 Astra / `gpt-6-astra` / Medium / `medium`** for implementation. C and D now use **GPT-6.1 Sol / `gpt-6.1-sol` / Medium / `medium`**: C executes A's plan, records failures/evidence and retests fixes; D retains all infrastructure and miscellaneous execution, tooling, deployment, documentation, evidence and authorized publication. C escalates ambiguities or missing coverage to A. The main conversation manages direction, coordination, review and team issue resolution. See [PWA responsibilities and active dispatches](PWA_Orchestration.md). This supersedes the former C/D Astra Low PWA assignments only; generic mappings, unrelated chats and persistent services remain unchanged.

- **R051 support override — owner instruction, 6 October 2026, 08:25:52 UTC:** use **GPT-6 Astra / `gpt-6-astra` / Low / `low`** (Astra Light) for this task's supporting verification, evidence and scoped read-only preflight work. This overrides the corresponding defaults only for the R051 continuation; other work categories retain the table above. Follow the same availability disclosure and supported-dispatch rules below.

- This file selects model/effort preferences; it does not authorize delegation or agent contact. Obtain explicit owner approval for each named outside agent before contacting it or delegating work to it. Model names and task categories are not approval for an individual outside agent. Apply all destination-specific permission controls before dispatch.
- An explicit owner selection for the current task takes precedence. Otherwise use the matching row. Use Execution for clear, bounded work not covered by another row; use Design when the desired behavior itself needs resolution.
- Split phases only when useful: Design or Troubleshooting resolves the uncertainty; Execution carries out the settled work. On-call retains responsibility for incident decisions while execution can perform the authorized repair. Verification that discovers an unexplained failure routes the diagnosis to Troubleshooting.
- Escalate when new ambiguity, conflicting evidence or repeated failed attempts requires diagnosis; do not keep retrying the same failing action. Pass existing findings so the next worker does not repeat discovery.
- Supply both the model and effort when the destination supports those controls. The IDs/effort values above are accepted by the Codex task tools available when this file was created; check the actual destination's supported options. Native Dots and other surfaces may not expose the same model controls. A written instruction alone does not change a running model.
- Apply changes to newly dispatched work or an explicit supported handoff. Preserve unrelated chats, active workers and persistent service settings. If the requested combination is unavailable, disclose that fact; do not silently substitute or claim a switch succeeded.
- Read the current saved file before dispatch. For a remote executor, publish owner edits and provide the repository path/revision; local unpublished edits are visible only to executors with access to that checkout. If the file cannot be read, report that limitation and use an explicit task-level owner selection if one exists instead of presenting cached choices as current.

## Updating the mapping

Change the Model, Model ID, Reasoning effort and Effort value cells together for each affected category, update the effective date, and commit/push under AGENTS publication rules. Dots should pick up the new assignment on its next read without changes to the standing rules. Add a category only when it has a distinct routing need. Keep historical choices in change logs, not extra competing tables.

These are owner preferences, not benchmark guarantees. The current table governs future assignments; previous choices are retained in the change log. No scheduled on-call service, model watcher or account-setting change is installed by this file. General capability guidance: [OpenAI model selection](https://developers.openai.com/api/docs/guides/model-selection), checked 2 October 2026; availability and reasoning controls vary by destination.
