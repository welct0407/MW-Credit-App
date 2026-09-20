#!/bin/sh
# Install reviewed receipt code without activating receipt processing or delivery.
set -eu
test "$(id -u)" -eq 0
repo=/opt/mw-integration-agent-src
test -z "$(git -C "$repo" status --porcelain)"
if systemctl is-active --quiet mw-receipt-summary.timer; then
    echo 'Receipt timer already active; use a reviewed update procedure' >&2
    exit 1
fi
backup=/var/lib/mw-integration-agent/rollback/receipts-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 0700 "$backup"
cp -a /etc/mw-integration-agent/config.json /etc/mw-integration-agent/service-catalogue.json "$backup/"
cp -a /opt/mw-integration-agent/.venv/lib/python3.13/site-packages/mw_integration_agent "$backup/"
/opt/mw-integration-agent/.venv/bin/python -m pip freeze > "$backup/packages.txt"
git -C "$repo" rev-parse HEAD > "$backup/install-source-commit.txt"
# Online SQLite backups include committed WAL records; never copy an open main DB alone.
/opt/mw-integration-agent/.venv/bin/python - "$backup" <<'PY'
import sqlite3,sys
from pathlib import Path
root=Path('/var/lib/mw-integration-agent/state')
for source in root.glob('*.db'):
    src=sqlite3.connect(f'file:{source}?mode=ro',uri=True)
    dest=sqlite3.connect(Path(sys.argv[1])/source.name)
    src.backup(dest)
    assert dest.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    dest.close();src.close()
print('Private journal backups passed integrity checks')
PY
resume=''
for timer in mw-cash-statement.timer mw-cash-statement-email-retry.timer; do
    if systemctl is-active --quiet "$timer"; then
        resume="$resume $timer"
        systemctl stop "$timer"
    fi
done
trap 'systemctl start mw-instagram-webhook.service; for timer in $resume; do systemctl start "$timer"; done' EXIT
for service in mw-cash-statement.service mw-cash-statement-email-retry.service mw-receipt-summary.service; do
    if systemctl is-active --quiet "$service"; then
        echo 'Business worker active; retry installation after it finishes' >&2
        exit 1
    fi
done
systemctl stop mw-instagram-webhook.service
/opt/mw-integration-agent/.venv/bin/python -m pip install "$repo"
install -o root -g mwagent -m 0640 "$repo/service-catalogue.json" /etc/mw-integration-agent/service-catalogue.json
install -o root -g root -m 0644 "$repo/systemd/mw-receipt-summary.service" /etc/systemd/system/
install -o root -g root -m 0644 "$repo/systemd/mw-receipt-summary.timer" /etc/systemd/system/
systemctl daemon-reload
cd "$repo"
/opt/mw-integration-agent/.venv/bin/python -m unittest discover -s tests -q
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent check \
 --config /etc/mw-integration-agent/config.json --catalogue /etc/mw-integration-agent/service-catalogue.json
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/python - <<'PY'
import json
from pathlib import Path
from mw_integration_agent.journal import IngressJournal
c=json.loads(Path('/etc/mw-integration-agent/config.json').read_text())
j=IngressJournal(Path(c['state_directory'])/'instagram-ingress.db')
j.close()
PY
systemctl start mw-instagram-webhook.service
echo "Receipt runtime installed, not activated. Rollback: $backup"
