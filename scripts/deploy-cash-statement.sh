#!/bin/sh
set -eu
test "$(id -u)" -eq 0
repo=/opt/mw-integration-agent-src
test -z "$(git -C "$repo" status --porcelain)"
backup=/var/lib/mw-integration-agent/rollback/cash-statement-$(date +%Y%m%dT%H%M%S)
install -d -m 0700 "$backup"
cp -a /etc/mw-integration-agent/config.json /etc/mw-integration-agent/service-catalogue.json "$backup/"
git -C "$repo" rev-parse HEAD > "$backup/source-commit.txt"
/opt/mw-integration-agent/.venv/bin/python -m pip freeze > "$backup/packages.txt"
cp -a /opt/mw-integration-agent/.venv/lib/python3.13/site-packages/mw_integration_agent "$backup/"
# Read-only reporting adds its own state; existing receiver and ingress journal are untouched.
apt-get update -qq
apt-get install -y --no-install-recommends fonts-thai-tlwg libraqm0
/opt/mw-integration-agent/.venv/bin/python -m pip install "$repo"
install -o root -g mwagent -m 0640 "$repo/service-catalogue.json" /etc/mw-integration-agent/service-catalogue.json
cd "$repo"
/opt/mw-integration-agent/.venv/bin/python -m unittest discover -s tests -v
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent check \
 --config /etc/mw-integration-agent/config.json --catalogue /etc/mw-integration-agent/service-catalogue.json
echo "Manual cash statement installed; no schedule or sending flag activated. Rollback: $backup"
