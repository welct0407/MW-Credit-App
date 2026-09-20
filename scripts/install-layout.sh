#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
install_root=/opt/mw-integration-agent

install -d -o root -g root -m 0755 "$install_root"
python3 -m venv "$install_root/.venv"
"$install_root/.venv/bin/python" -m pip install --upgrade pip
"$install_root/.venv/bin/python" -m pip install "$project_root"
install -o root -g mwagent -m 0640 "$project_root/config.example.json" /etc/mw-integration-agent/config.example.json
install -o root -g mwagent -m 0640 "$project_root/service-catalogue.json" /etc/mw-integration-agent/service-catalogue.json
install -o root -g root -m 0644 "$project_root/systemd/mw-integration-agent-verify.service" /etc/systemd/system/mw-integration-agent-verify.service
systemctl daemon-reload

echo "Layout installed. The verification unit remains disabled and no runtime service exists yet."
