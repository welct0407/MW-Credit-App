# Partner Instagram formatting — 27 September 2026

Owner requested readable Instagram messages after a Markdown table was displayed literally. Baseline: c1446e9; clean local tree. Scope: conversation base instructions used on both thread/start and thread/resume, operational documentation, and a synthetic English/Thai two-process formatting check. No schema, service authority, model, data or delivery-policy change.

The reply leads with the answer, uses short paragraphs and labeled record bullets, and preserves totals, exclusions, projections and timestamps. No Markdown tables/code/formatting. Existing long-message email fallback stays intact.

Validation/deployment: pending. Rollback: restore the verified private VM copy of partner_conversation.py atomically between conversation cycles; preserve all state and accepted operations. No past replies are replayed.

Completed: source b263dac43b4df1b32454cb4d4cf1e5e6c1a81d6f published and prompt installed on the verified Debian VM at 2026-09-27 16:55 UTC. Only the conversation timer was briefly paused; the service was inactive before replacement. Installed old file exactly matched deployed source34c4133. Its recovery copy was verified byte-for-byte at `/var/lib/mw-integration-agent/rollback/conversation-format-20260927T165506Z/partner_conversation.py`; replacement was atomic. Installed SHA256 `65a17f00b2bdae2ef268c3ed27aae40eeb4b8e0757dea1439097f273637879fc`. This is a single-file prompt overlay on the existing package, not a full package redeployment or configuration change.

Validation: 24 conversation tests passed on Debian; local24 passed with one environment-dependent skip. Actual Codex fresh English and resumed Thai synthetic turns produced plain text bullets with all four test amounts retained, exclusions and projection timestamps intact; zero business reads/writes or outbound messages. Timer resumed active; service Result=success and ExecMainStatus=0. Existing partner replies were not resent; next natural conversation uses the updated prompt. Actual recipient acceptance remains for normal use. No AppSheet/business database/release package changed.
