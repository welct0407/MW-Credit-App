@AGENTS.md

## Claude Code only

These additions apply to Claude Code; `AGENTS.md` above is shared with Codex and stays the source of project rules.

- In a Claude Code cloud session, first make sure all three repositories are present: if `/home/user/MW-Credit-App` or `/home/user/MW-Integration-Agent` (any letter case) is missing, attach it with push access (`add_repo`), clone it as instructed and register it, without asking. Tools come from [scripts/cloud-session-setup.sh](scripts/cloud-session-setup.sh); run `npm ci` in MW-Credit-App when the task needs it.
