#!/bin/sh
set -eu
test "$(id -u)" -eq 0
repo=/opt/mw-integration-agent-src
test -z "$(git -C "$repo" status --porcelain)"
test -s /etc/mw-integration-agent/secrets/outlook-email-oauth.json

backup=/var/lib/mw-integration-agent/rollback/cash-statement-schedule-$(date +%Y%m%dT%H%M%S)
install -d -m 0700 "$backup"
cp -a /etc/mw-integration-agent/config.json /etc/mw-integration-agent/service-catalogue.json "$backup/"
for unit in mw-cash-statement.service mw-cash-statement.timer mw-cash-statement-email-retry.service mw-cash-statement-email-retry.timer; do
  test ! -e "/etc/systemd/system/$unit" || cp -a "/etc/systemd/system/$unit" "$backup/"
done
git -C "$repo" rev-parse HEAD > "$backup/source-commit.txt"
/opt/mw-integration-agent/.venv/bin/python -m pip freeze > "$backup/packages.txt"

/opt/mw-integration-agent/.venv/bin/python -m pip install "$repo"
install -o root -g mwagent -m 0640 "$repo/service-catalogue.json" /etc/mw-integration-agent/service-catalogue.json
/opt/mw-integration-agent/.venv/bin/python - /etc/mw-integration-agent/config.json <<'PY'
import json,os,sys,tempfile
path=sys.argv[1]
with open(path,encoding='utf-8') as f: value=json.load(f)
value.update(cash_statement_schedule_enabled=True,email_fallback_enabled=True,
             email_oauth_file='/etc/mw-integration-agent/secrets/outlook-email-oauth.json',
             email_sender='welctcodex@outlook.com')
fd,temp=tempfile.mkstemp(dir=os.path.dirname(path)); os.close(fd)
with open(temp,'w',encoding='utf-8') as f: json.dump(value,f,indent=2); f.write('\n')
os.chown(temp,0,__import__('grp').getgrnam('mwagent').gr_gid); os.chmod(temp,0o640); os.replace(temp,path)
PY

for unit in mw-cash-statement.service mw-cash-statement.timer mw-cash-statement-email-retry.service mw-cash-statement-email-retry.timer; do
  install -o root -g root -m 0644 "$repo/systemd/$unit" "/etc/systemd/system/$unit"
done
systemctl daemon-reload
systemctl enable --now mw-cash-statement.timer mw-cash-statement-email-retry.timer
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent check \
  --config /etc/mw-integration-agent/config.json --catalogue /etc/mw-integration-agent/service-catalogue.json
systemctl list-timers mw-cash-statement.timer mw-cash-statement-email-retry.timer --no-pager
echo "Cash statement schedule enabled. Rollback files: $backup (preserve delivery journals)."
