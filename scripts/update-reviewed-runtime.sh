#!/bin/sh
# Reviewed, backed-up update; preserves activation controls and all journals.
set -eu
test "$(id -u)" -eq 0
repo=/opt/mw-integration-agent-src
test -z "$(git -C "$repo" status --porcelain)"
# R014 dependency: refuse installation before the separate database promotion.
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/python - <<'PY'
import json
from pathlib import Path
from mw_integration_agent.cash_statement import read_query
c=json.loads(Path('/etc/mw-integration-agent/config.json').read_text())
ready=read_query(c, '''SELECT to_json(EXISTS(SELECT 1 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='Partners' AND column_name='AI Reviewer'
 AND data_type='boolean' AND is_nullable='NO'));''')
if ready is not True:raise SystemExit('R014 Partners.AI Reviewer must be promoted before this runtime update')
PY
backup=/var/lib/mw-integration-agent/rollback/reviewed-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 0700 "$backup"
cp -a /etc/mw-integration-agent/config.json /etc/mw-integration-agent/service-catalogue.json "$backup/"
if [ -f /etc/mw-integration-agent/appsheet-schema.json ]; then
 cp -a /etc/mw-integration-agent/appsheet-schema.json "$backup/"
fi
cp -a /opt/mw-integration-agent/.venv/lib/python3.13/site-packages/mw_integration_agent "$backup/"
resume=''
for timer in mw-conversation-poll.timer mw-receipt-summary.timer mw-cash-statement.timer mw-cash-statement-email-retry.timer mw-partner-conversation.timer; do
 if systemctl is-active --quiet "$timer"; then resume="$resume $timer"; systemctl stop "$timer"; fi
done
trap 'for timer in $resume; do systemctl start "$timer"; done' EXIT
for service in mw-conversation-poll.service mw-receipt-summary.service mw-cash-statement.service mw-cash-statement-email-retry.service mw-partner-conversation.service; do
 if systemctl is-active --quiet "$service"; then echo 'Worker active; retry after completion'; exit 1; fi
done
/opt/mw-integration-agent/.venv/bin/python - "$backup" <<'PY'
import sqlite3,sys
from pathlib import Path
for source in Path('/var/lib/mw-integration-agent/state').glob('*.db'):
 src=sqlite3.connect(f'file:{source}?mode=ro',uri=True)
 dest=sqlite3.connect(Path(sys.argv[1])/source.name);src.backup(dest)
 assert dest.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 dest.close();src.close()
print('Private journals backed up and integrity checked')
PY
if [ -d /var/lib/mw-integration-agent/state/partner-conversations ]; then
 cp -a /var/lib/mw-integration-agent/state/partner-conversations "$backup/"
fi
cd "$repo"
/opt/mw-integration-agent/.venv/bin/python -m pip install "$repo"
/opt/mw-integration-agent/.venv/bin/python -m unittest discover -s tests -q
install -o root -g mwagent -m 0640 service-catalogue.json /etc/mw-integration-agent/service-catalogue.json
/opt/mw-integration-agent/.venv/bin/python - <<'PY'
import json
from pathlib import Path
from datetime import datetime,timezone
p=Path('/etc/mw-integration-agent/config.json');c=json.loads(p.read_text())
# New notification route starts now; no historical receipt or delivery replay.
c.setdefault('partner_notice_cutoff',datetime.now(timezone.utc).isoformat())
c.setdefault('receipt_hold_notice_cutoff',datetime.now(timezone.utc).isoformat())
p.write_text(json.dumps(c,indent=2)+'\n')
PY
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent check --config /etc/mw-integration-agent/config.json --catalogue /etc/mw-integration-agent/service-catalogue.json
echo "Reviewed runtime installed. Rollback: $backup"
