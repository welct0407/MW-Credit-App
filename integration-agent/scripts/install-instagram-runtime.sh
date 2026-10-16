#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
install -d -o root -g mwagent -m 0750 /etc/mw-integration-agent/secrets
install -d -o mwagent -g mwagent -m 0750 /var/lib/mw-integration-agent/state
"/opt/mw-integration-agent/.venv/bin/python" -m pip install --require-hashes -r "$project_root/requirements.lock"
"/opt/mw-integration-agent/.venv/bin/python" -m pip install --no-deps "$project_root"
install -o root -g mwagent -m 0640 "$project_root/config.example.json" /etc/mw-integration-agent/config.example.json
install -o root -g mwagent -m 0640 "$project_root/service-catalogue.json" /etc/mw-integration-agent/service-catalogue.json
install -o root -g root -m 0644 "$project_root/systemd/mw-instagram-webhook.service" /etc/systemd/system/mw-instagram-webhook.service
install -o root -g root -m 0644 "$project_root/systemd/mw-cloudflared-instagram.service" /etc/systemd/system/mw-cloudflared-instagram.service
systemctl daemon-reload

echo "Instagram runtime installed. Services remain disabled until credentials and live config are installed."
