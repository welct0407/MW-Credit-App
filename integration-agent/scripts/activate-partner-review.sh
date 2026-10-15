#!/bin/sh
# Owner-authorized linked Partner review; manual-only closure and overpayment.
set -eu
test "$(id -u)" -eq 0
test -n "${1:-}"
cp -a /etc/mw-integration-agent/config.json /etc/mw-integration-agent/config.before-partner-review.json
/opt/mw-integration-agent/.venv/bin/python - "$1" <<'PY'
import json,sys
from pathlib import Path
from datetime import datetime,timezone
p=Path('/etc/mw-integration-agent/config.json');c=json.loads(p.read_text())
c.setdefault('partner_review_cutoff',datetime.now(timezone.utc).isoformat())
c['partner_review_enabled']=True
c['partner_review_execution_enabled']=True
c['partner_review_backup_id']=sys.argv[1]
p.write_text(json.dumps(c,indent=2)+'\n')
PY
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent check --config /etc/mw-integration-agent/config.json --catalogue /etc/mw-integration-agent/service-catalogue.json
# Reload webhook code so new signed messages preserve their reply_to.mid.
systemctl restart mw-instagram-webhook.service
systemctl is-active mw-instagram-webhook.service mw-receipt-summary.timer mw-conversation-poll.timer
