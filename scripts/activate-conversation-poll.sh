#!/bin/sh
# Owner-authorized API-only intake. Run after reviewed-runtime backup/install/tests.
set -eu
test "$(id -u)" -eq 0
cp -a /etc/mw-integration-agent/config.json /etc/mw-integration-agent/config.before-conversation-poll.json
/opt/mw-integration-agent/.venv/bin/python - <<'PY'
import json
from pathlib import Path
from datetime import datetime,timezone
p=Path('/etc/mw-integration-agent/config.json');c=json.loads(p.read_text())
c.setdefault('conversation_poll_cutoff',datetime.now(timezone.utc).isoformat())
c['conversation_poll_enabled']=True
p.write_text(json.dumps(c,indent=2)+'\n')
PY
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent check --config /etc/mw-integration-agent/config.json --catalogue /etc/mw-integration-agent/service-catalogue.json
install -m 0644 /opt/mw-integration-agent-src/systemd/mw-conversation-poll.service /opt/mw-integration-agent-src/systemd/mw-conversation-poll.timer /etc/systemd/system/
systemctl daemon-reload
systemctl start mw-conversation-poll.service
systemctl enable --now mw-conversation-poll.timer
